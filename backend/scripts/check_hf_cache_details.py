import os, heapq
hub=os.path.join(os.path.expanduser('~'),'.cache','huggingface','hub')
print('hub=',hub, 'exists', os.path.exists(hub))
if not os.path.exists(hub):
    raise SystemExit(0)

# find large files/dirs under hub
sizes=[]
for root, dirs, files in os.walk(hub):
    total=0
    for f in files:
        try:
            total += os.path.getsize(os.path.join(root,f))
        except Exception:
            pass
    if total>0:
        sizes.append((total, root))

for size, path in heapq.nlargest(10, sizes):
    print(size, path)
