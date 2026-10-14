package main

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
)

func TestEmbeddedGame(t *testing.T) {
	var beat atomic.Int64
	h := handler("test-token", &beat)
	r := httptest.NewRecorder()
	h.ServeHTTP(r, httptest.NewRequest("GET", "/", nil))
	if r.Code != 200 || !strings.Contains(r.Body.String(), "GENERALS") || !strings.Contains(r.Body.String(), "launcherBeat") {
		t.Fatal("embedded game or heartbeat missing")
	}
	root, _ := assets.ReadDir("web/assets")
	for _, f := range root {
		r = httptest.NewRecorder()
		h.ServeHTTP(r, httptest.NewRequest("GET", "/assets/"+f.Name(), nil))
		if r.Code != 200 {
			t.Fatal("asset not served", f.Name())
		}
	}
}
func TestHeartbeatRequiresToken(t *testing.T) {
	var beat atomic.Int64
	h := handler("test-token", &beat)
	r := httptest.NewRecorder()
	h.ServeHTTP(r, httptest.NewRequest("POST", "/__heartbeat", nil))
	if r.Code != http.StatusForbidden || beat.Load() != 0 {
		t.Fatal("unauthorized heartbeat accepted")
	}
	req := httptest.NewRequest("POST", "/__heartbeat", nil)
	req.Header.Set("X-Launcher-Token", "test-token")
	r = httptest.NewRecorder()
	h.ServeHTTP(r, req)
	if r.Code != 204 || beat.Load() == 0 {
		t.Fatal("heartbeat failed")
	}
}
