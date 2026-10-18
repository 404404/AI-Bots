from PIL import Image
from pathlib import Path
import json,sys
image=Image.open(sys.argv[1]).convert('RGB');pixels=image.load();groups=[]
for y in range(image.height):
 runs=[]; start=None
 for x in range(image.width):
  r,g,b=pixels[x,y];hit=g>80 and b>80 and r<g*.7 and abs(g-b)<20
  if hit and start is None:start=x
  if start is not None and (not hit or x==image.width-1):
   end=x if not hit else x+1
   if end-start>150:runs.append([start,end])
   start=None
 if runs:
  if groups and groups[-1]['lastY']==y-1 and groups[-1]['runs']==runs:groups[-1]['lastY']=y
  else:groups.append({'firstY':y,'lastY':y,'runs':runs})
widths=[r[1]-r[0] for g in groups for r in g['runs']]
passed=len(groups)==3 and len(set(widths))==1
print(json.dumps({'image':Path(sys.argv[1]).name,'bands':groups,'paintedThreeEmbeds':len(groups)==3,'matchingWidths':len(set(widths))==1,'widths':widths,'passed':passed}))
sys.exit(0 if passed else 2)
