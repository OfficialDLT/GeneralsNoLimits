package main

import (
	"bytes"
	"crypto/rand"
	"embed"
	"encoding/hex"
	"flag"
	"fmt"
	"io/fs"
	"log"
	"net"
	"net/http"
	"os/exec"
	"runtime"
	"strings"
	"sync/atomic"
	"time"
)

//go:embed web
var assets embed.FS

func handler(token string, heartbeat *atomic.Int64) http.Handler {
	root, err := fs.Sub(assets, "web")
	if err != nil {
		panic(err)
	}
	files := http.FileServer(http.FS(root))
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/__heartbeat" {
			if r.Method != http.MethodPost || r.Header.Get("X-Launcher-Token") != token {
				http.Error(w, "Forbidden", http.StatusForbidden)
				return
			}
			heartbeat.Store(time.Now().Unix())
			w.WriteHeader(http.StatusNoContent)
			return
		}
		if r.URL.Path == "/" || r.URL.Path == "/index.html" {
			page, err := fs.ReadFile(root, "index.html")
			if err != nil {
				http.Error(w, "Game files unavailable", 500)
				return
			}
			script := fmt.Sprintf(`<script>const launcherBeat=()=>fetch('/__heartbeat',{method:'POST',headers:{'X-Launcher-Token':'%s'}}).catch(()=>{});launcherBeat();setInterval(launcherBeat,5000);</script>`, token)
			w.Header().Set("Content-Type", "text/html; charset=utf-8")
			w.Header().Set("Cache-Control", "no-store")
			w.Write(bytes.Replace(page, []byte("</body>"), []byte(script+"</body>"), 1))
			return
		}
		if strings.HasPrefix(r.URL.Path, "/__") {
			http.NotFound(w, r)
			return
		}
		files.ServeHTTP(w, r)
	})
}

func openBrowser(url string) error {
	switch runtime.GOOS {
	case "windows":
		return exec.Command("rundll32.exe", "url.dll,FileProtocolHandler", url).Start()
	case "darwin":
		return exec.Command("open", url).Start()
	default:
		return exec.Command("xdg-open", url).Start()
	}
}

func showError(err error) {
	log.Print(err)
	if runtime.GOOS == "windows" {
		exec.Command("powershell.exe", "-NoProfile", "-NonInteractive", "-Command", `Add-Type -AssemblyName PresentationFramework; [System.Windows.MessageBox]::Show('Het spel kon niet starten. Sluit het en probeer opnieuw.','Generals No Limits')`).Run()
	}
}

func main() {
	noBrowser := flag.Bool("no-browser", false, "Do not open a browser (validation)")
	flag.Parse()
	listener, err := net.Listen("tcp4", "127.0.0.1:0")
	if err != nil {
		showError(err)
		return
	}
	tokenBytes := make([]byte, 32)
	if _, err = rand.Read(tokenBytes); err != nil {
		showError(err)
		return
	}
	var heartbeat atomic.Int64
	heartbeat.Store(time.Now().Unix())
	server := &http.Server{Handler: handler(hex.EncodeToString(tokenBytes), &heartbeat), ReadHeaderTimeout: 5 * time.Second}
	url := "http://" + listener.Addr().String()
	fmt.Println(url)
	go func() {
		for range time.Tick(5 * time.Second) {
			if time.Now().Unix()-heartbeat.Load() > 120 {
				server.Close()
				return
			}
		}
	}()
	if !*noBrowser {
		if err := openBrowser(url); err != nil {
			listener.Close()
			showError(err)
			return
		}
	}
	if err := server.Serve(listener); err != nil && err != http.ErrServerClosed {
		showError(err)
	}
}
