"""Reproducible single-thread browser KataGo eval + PUCT build.
Requires emsdk 6.0.13, Eigen 3.4.0 and the pinned KataGo/WebGPU checkout.
See third_party/KATAGO.md. All compiler inputs and outputs remain in the workspace.
"""
import os,sys,json,subprocess,concurrent.futures,hashlib,time
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
SOURCE=Path(os.environ.get('MYSKME_KATAGO_SOURCE','/workspace/scratch/katago-webgpu'))
SDK=Path(os.environ.get('MYSKME_EMSDK','/workspace/scratch/emsdk'))
EIGEN=Path(os.environ.get('MYSKME_EIGEN','/workspace/scratch/eigen'))
RUNTIME=ROOT/'dist' if (ROOT/'dist').is_dir() else ROOT.parent/'boardroom'
OUT=RUNTIME/'vendor/katago';OUT.mkdir(parents=True,exist_ok=True)
EMCC=str(SDK/'upstream/emscripten/emcc')
CPP=SOURCE/'cpp';OBJ=SOURCE/'cpp/build-myskme';OBJ.mkdir(exist_ok=True)
PIN='d5ad1c0423dba989c60a2f06b1848e7eec2b5941'
assert subprocess.check_output(['git','rev-parse','HEAD'],cwd=SOURCE,text=True).strip()==PIN
patch=ROOT/'third_party/katago-runtime.patch'
if subprocess.run(['git','apply','--check',str(patch)],cwd=SOURCE,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL).returncode==0:
 subprocess.run(['git','apply',str(patch)],cwd=SOURCE,check=True)
else:
 subprocess.run(['git','apply','--reverse','--check',str(patch)],cwd=SOURCE,check=True)
flags=['-O3','-fexceptions','-msimd128','-DNO_GIT_REVISION','-DNDEBUG','-DEIGEN_MPL2_ONLY','-DHALF_ENABLE_CPP11_CFENV=0','-I','external','-isystem','external/filesystem-1.5.8/include','--use-port=emdawnwebgpu','-sUSE_ZLIB=1']
config=json.dumps({'flags':flags,'sdk':str(SDK),'eigen':str(EIGEN),'revision':PIN},sort_keys=True)
configFile=OBJ/'build-key.json'
if not configFile.exists() or configFile.read_text()!=config:
 for obj in OBJ.glob('*.o'):obj.unlink()
 configFile.write_text(config)
sources=[s.strip() for s in (CPP/'kataeval/sources.txt').read_text().splitlines() if s.strip() and not s.startswith('#')]
def compile_one(src):
 obj=OBJ/(src.replace('/','_').replace('.','_')+'.o')
 if obj.exists() and obj.stat().st_mtime>(CPP/src).stat().st_mtime:return obj
 std='-std=c++20' if src=='kataeval/backend_gpu.cpp' else '-std=c++17'
 extra=['-DUSE_EIGEN_BACKEND','-isystem',str(EIGEN)] if src=='kataeval/backend_cpu.cpp' else []
 print('compile '+src,flush=True)
 subprocess.run([EMCC,'-c',src,std,*flags,*extra,'-o',str(obj)],cwd=CPP,check=True)
 return obj
# Fetch/cache Emscripten ports once before parallel compilation.
probe=OBJ/'probe.cpp';probe.write_text('int main(){return 0;}\n')
subprocess.run([EMCC,'-c',str(probe),*flags,'-o',str(OBJ/'probe.o')],cwd=CPP,check=True)
with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:objects=list(pool.map(compile_one,sources))
exports='_kgeLoad,_kgeEval,_kgeEvalSeq,_kgeEvalBatch,_kgeSearch,_kgeSetGumbel,_kgeSetPolicyOptimism,_kgeError,_kgeBoardSize,_kgeModelVersion,_kgeBackendIsGpu,_kgeSetForceCpu,_kgeSetFp16,_malloc,_free'
subprocess.run([str(SDK/'upstream/emscripten/em++'),*map(str,objects),'--use-port=emdawnwebgpu','-sUSE_ZLIB=1','-fexceptions','-msimd128','-sASYNCIFY','-sALLOW_MEMORY_GROWTH=1','-sINITIAL_MEMORY=64MB','-sMAXIMUM_MEMORY=512MB','-sFORCE_FILESYSTEM=1','-sSTACK_SIZE=16MB','-sMODULARIZE=1','-sEXPORT_NAME=createKata','-sENVIRONMENT=web,worker,node','-sEXPORTED_FUNCTIONS='+exports,'-sEXPORTED_RUNTIME_METHODS=ccall,cwrap,FS,HEAPF32,HEAP32,UTF8ToString','-O3','-o',str(OUT/'kataeval.js')],cwd=CPP,check=True)
for name,src in [('model-b6.bin.gz','g170-b6c96-s175395328-d26788732.bin.gz'),('model-b10.bin.gz','g170e-b10c128-s1141046784-d204142634.bin.gz')]:
 (OUT/name).write_bytes((CPP/'tests/models'/src).read_bytes())
(OUT/'package.json').write_text('{"type":"commonjs"}\n')
manifest={'upstream':'https://github.com/saigo-online/katago-webgpu','revision':PIN,'emscripten':'6.0.13','eigen':'3.4.0','patchSha256':hashlib.sha256(patch.read_bytes()).hexdigest(),'files':{p.name:{'bytes':p.stat().st_size,'sha256':hashlib.sha256(p.read_bytes()).hexdigest()} for p in sorted(OUT.iterdir()) if p.is_file() and p.suffix in ('.js','.wasm','.gz')}}
(OUT/'build.json').write_text(json.dumps(manifest,indent=2)+'\n')
(OUT/'source.patch').write_bytes(patch.read_bytes())
(OUT/'build-katago.py').write_bytes(Path(__file__).read_bytes())
(OUT/'SOURCE.md').write_bytes((ROOT/'third_party/KATAGO.md').read_bytes())
print(json.dumps(manifest),flush=True)
