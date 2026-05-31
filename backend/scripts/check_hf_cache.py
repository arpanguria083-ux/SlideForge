import os
p=os.path.expanduser('~')
print('home',p)
hub=os.path.join(p,'.cache','huggingface','hub')
print('hub exists', os.path.exists(hub), 'hub=',hub)
if os.path.exists(hub):
    for root, dirs, files in os.walk(hub):
        for d in dirs:
            if d.lower().startswith('repo') or d.lower().startswith('snapshots') or d.lower().startswith('files'):
                print('dir', os.path.join(root,d))
        break
