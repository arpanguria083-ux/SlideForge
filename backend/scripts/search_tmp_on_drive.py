import os
import sys

drive='F:\\'
if not os.path.exists(drive):
    print('drive missing', drive)
    sys.exit(0)

for name in os.listdir(drive):
    path = os.path.join(drive, name)
    if not os.path.isdir(path):
        continue
    # search inside path up to depth 3
    for root, dirs, files in os.walk(path):
        for d in dirs:
            if d.startswith('.tmp'):
                full = os.path.join(root, d)
                try:
                    size = 0
                    for r, ds, fs in os.walk(full):
                        for f in fs:
                            try:
                                size += os.path.getsize(os.path.join(r,f))
                            except Exception:
                                pass
                    print('FOUND', full, 'size', size)
                except Exception as e:
                    print('error', full, e)
        # limit depth
        if root.count(os.sep) - path.count(os.sep) > 3:
            dirs[:] = []
print('done')
