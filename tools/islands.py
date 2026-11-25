import sys
from PIL import Image
def islands(path, minsize=6):
    im = Image.open(path).convert('RGBA'); w, h = im.size; a = im.getchannel('A').load()
    seen = set(); out = []
    for y in range(h):
        for x in range(w):
            if a[x, y] < 20 or (x, y) in seen: continue
            st = [(x, y)]; seen.add((x, y)); x0 = x1 = x; y0 = y1 = y
            while st:
                cx, cy = st.pop()
                x0 = min(x0, cx); x1 = max(x1, cx); y0 = min(y0, cy); y1 = max(y1, cy)
                for dx, dy in ((1,0),(-1,0),(0,1),(0,-1)):
                    nx, ny = cx+dx, cy+dy
                    if 0 <= nx < w and 0 <= ny < h and (nx, ny) not in seen and a[nx, ny] >= 20:
                        seen.add((nx, ny)); st.append((nx, ny))
            if x1-x0 >= minsize and y1-y0 >= minsize: out.append((x0, y0, x1+1, y1+1))
    return out
if __name__ == '__main__':
    for b in islands(sys.argv[1]): print(b, b[2]-b[0], b[3]-b[1])
