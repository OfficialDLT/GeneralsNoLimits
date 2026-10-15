"""Original synthesized score and Flite radio voices. Requires numpy and ffmpeg.
Assets are committed; generation is not required to play or build the game.
No samples or recordings from Command & Conquer are used.
"""
from pathlib import Path
import hashlib,json,math,subprocess,tempfile,wave
import numpy as np
ROOT=Path(__file__).resolve().parents[1]
RATE=22050
AUDIO=ROOT/'public/audio'
(AUDIO/'units').mkdir(parents=True,exist_ok=True)
(AUDIO/'music').mkdir(parents=True,exist_ok=True)
rng=np.random.default_rng(41)
def note(midi):return 440*2**((midi-69)/12)
def score(name,key,bpm,bars,style):
 beat=60/bpm;length=bars*4*beat;n=int(length*RATE);mix=np.zeros((n,2),dtype=np.float64)
 def add(start,duration,freq,amp,kind='pad',pan=0):
  start=int(start*RATE);count=min(int(duration*RATE),n-start)
  if count<=0:return
  t=np.arange(count)/RATE;attack=.08 if kind=='pad' else .012;release=.2 if kind=='pad' else .08
  env=np.minimum(1,t/attack)*np.minimum(1,(count/RATE-t)/release)
  if kind=='pad':sound=np.sin(2*np.pi*freq*t)*.7+np.sin(2*np.pi*(freq*1.003)*t)*.2+np.sin(2*np.pi*freq*2*t)*.12;env*=np.exp(-t/max(duration,1)*.6)
  elif kind=='brass':sound=sum(np.sin(2*np.pi*freq*h*t)/h**1.8 for h in [1,2,3,4,5]);env*=np.exp(-t*2)
  elif kind=='bass':sound=np.sin(2*np.pi*freq*t)+.25*np.sin(2*np.pi*freq*2*t);env*=np.exp(-t*4)
  elif kind=='kick':sound=np.sin(2*np.pi*(42*t+8*(1-np.exp(-t*18))));env=np.exp(-t*15)*np.minimum(1,t/.004)
  elif kind=='snare':sound=rng.normal(0,.6,count)+np.sin(2*np.pi*180*t)*.25;env=np.exp(-t*22)*np.minimum(1,t/.002)
  else:sound=rng.normal(0,.3,count);env=np.exp(-t*90)
  signal=sound*env*amp
  mix[start:start+count,0]+=signal*(1-pan*.35);mix[start:start+count,1]+=signal*(1+pan*.35)
 progression=[(0,'minor'),(-2,'major'),(-4,'major'),(-5,'major'),(3,'major'),(-4,'major'),(-5,'major'),(0,'minor')]
 melody=[0,7,12,10,7,3,5,7,0,7,15,12,10,7,5,3]
 for bar in range(bars):
  root,quality=progression[(bar//2)%len(progression)];root+=key;third=3 if quality=='minor' else 4
  for interval in [0,third,7,12]:add(bar*4*beat,4*beat,note(root+interval+12),.025,'pad',(interval-5)/9)
  for b in range(4):
   at=(bar*4+b)*beat
   add(at,beat*.8,note(root-12+(7 if b==3 else 0)),.105,'bass')
   if b in [0,2] or style=='china' and b==3:add(at,.3,60,.18,'kick')
   if b in [1,3]:add(at,.22,180,.055,'snare',.1)
   for half in [0,.5]:add(at+half*beat,.09,4000,.025,'hat',-.4)
   interval=melody[(bar*2+b)%len(melody)]
   if b in [0,2] and bar%4>=1:add(at,beat*1.3,note(key+24+interval),.045,'brass',.25)
   if style in ['usa','menu']:
    for step in range(2):add(at+step*beat/2,beat*.3,note(root+24+[0,7,third,12][(b*2+step)%4]),.018,'brass',-.3)
   if style=='gla' and b%2==0:add(at+.25*beat,beat*.45,note(root+24+7),.04,'brass',-.2)
 fade=int(.04*RATE);mix[:fade]*=np.linspace(0,1,fade)[:,None];mix[-fade:]*=np.linspace(1,0,fade)[:,None]
 mix=np.tanh(mix*1.7);peak=np.max(np.abs(mix));mix*=.86/max(peak,.01)
 with tempfile.NamedTemporaryFile(suffix='.wav') as temp:
  with wave.open(temp.name,'wb') as w:w.setnchannels(2);w.setsampwidth(2);w.setframerate(RATE);w.writeframes((mix*32767).astype('<i2').tobytes())
  subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-y','-i',temp.name,'-c:a','libmp3lame','-b:a','96k',str(AUDIO/'music'/f'{name}.mp3')],check=True)
 print('Score:',name,round(length),'seconds',flush=True)
for params in [('iron-horizon',50,100,24,'menu'),('usa-command',50,108,16,'usa'),('china-command',45,104,16,'china'),('gla-command',48,112,16,'gla')]:score(*params)
units=json.loads((ROOT/'src/config/units.json').read_text());profiles={}
custom={
 'ranger':['Ranger squad, reporting in.','Boots on the ground. Moving out.','Squad, engage that target.'],
 'crusader':['Crusader armor is ready.','Tracks rolling, commander.','Main gun, fire at will.'],
 'usa_dozer':['Construction crew is standing by.','Taking our tools over there.','Clearing the construction site.'],
 'china_dozer':['Engineering team is ready.','Heavy machinery moving.','We will clear the way.'],
 'worker':['Tools are ready. What needs building?','I will take the back road.','We will stand our ground.'],
 'battlemaster':['Armor battalion awaiting orders.','Engines forward. Keep formation.','Full barrage. Break their line.'],
 'scorpion':['Scorpion crew, ready to strike.','Taking the back roads.','Hit them where it hurts.'],
 'burton':['Burton here. Give me the mission.','Quiet and steady. On my way.','I have the target in sight.'],
 'lotus':['Lotus online. Awaiting your signal.','Moving through their blind spot.','Their systems belong to us.'],
 'jarmen':['The marksman is in position.','A quiet path. Nobody will see me.','One shot is all I need.']}
voices=['rms','awb','kal','slt','kal16']
for index,(unit,d) in enumerate(units.items()):
 digest=hashlib.sha256(unit.encode()).digest();voice='slt' if unit=='lotus' else voices[digest[0]%len(voices)]
 pitch=round(.80+(index%13)*.035,3);tempo=round(.92+(index//13)*.035,3)
 lines=custom.get(unit,[d['voice']['select'],d['voice']['move'],d['voice']['attack']])
 if unit=='burton':voice='rms';pitch=.86
 if unit in ['overlord','emperor']:voice='rms';pitch=.72 if unit=='overlord' else .76
 profiles[unit]={'voice':voice,'pitch':pitch,'tempo':tempo,'assetBase':f'audio/units/{unit}','lines':dict(zip(['select','move','attack'],lines))}
 for action,text in profiles[unit]['lines'].items():
  with tempfile.NamedTemporaryFile(mode='w',suffix='.txt') as f:
   f.write(text);f.flush()
   source=f'flite=textfile={f.name}:voice={voice}'
   filters=f'rubberband=pitch={pitch}:tempo={tempo},highpass=f=190,lowpass=f=3600,acompressor=threshold=0.12:ratio=2.5,alimiter=limit=0.9'
   subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-y','-f','lavfi','-i',source,'-af',filters,'-ar','22050','-ac','1','-c:a','libmp3lame','-b:a','48k',str(AUDIO/'units'/f'{unit}-{action}.mp3')],check=True)
 print('Radio voice:',unit,voice,pitch,tempo,flush=True)
(ROOT/'src/config/voice-profiles.json').write_text(json.dumps(profiles,indent=2)+'\n')
