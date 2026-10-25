import re,glob,os,sys
os.chdir(sys.argv[1])
out=["# js/app/ map","","The page script, split by section. Plain scripts (no modules): top-level `const`/`let`/`function` names are shared by every later file, so load order matters (see index.html). Open only the file you need; use this table to find where a name lives.","","Gotcha: at load time a file can't hand over a function from a *later* file as a value (e.g. `addEventListener('change', commit)` in a file before 12-undo.js). Wrap it: `() => commit()`.","","Regenerate this table after adding or renaming top-level names: `python3 tools/map.py .` (or update it by hand).","","| File | Purpose | Defines |","|---|---|---|"]
for f in sorted(glob.glob('js/app/*.js')):
    t=open(f).read(); desc=re.search(r'· (.*)\n',t).group(1).replace('|','/'); ns=[]
    for l in t.split('\n'):
        m=re.match(r'(?:async )?function (\w+)',l)
        if m: ns.append(m.group(1)+'()'); continue
        m=re.match(r'(?:const|let|var) (.*)',l)
        if m:
            depth=0;cur='';parts=[]
            for ch in m.group(1):
                if ch in '([{':depth+=1
                elif ch in ')]}':depth-=1
                if ch==',' and depth==0: parts.append(cur);cur=''
                elif ch==';' and depth==0: break
                else: cur+=ch
            parts.append(cur)
            ns+=[n.group(1) for p in parts if (n:=re.match(r'\s*(\$|\w+)\s*=',p))]
    out.append(f"| {os.path.basename(f)} | {desc} | {', '.join('`'+n+'`' for n in ns)} |")
open('js/app/MAP.md','w').write('\n'.join(out)+'\n')
