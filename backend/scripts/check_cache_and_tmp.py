import os, sys, glob

candidates = [
    r'F:\\Users\\user\\.slideforge\\data\\ocr_models',
    r'C:\\Users\\user\\.slideforge\\data\\ocr_models',
    r'F:\\code project\\SlideForge\\backend',
    os.path.expanduser('~'),
    os.environ.get('MODEL_CACHE_DIR',''),
    os.environ.get('SLIDEFORGE_OCR_DIR',''),
    os.environ.get('SLIDEFORGE_DATA_DIR',''),
    os.environ.get('DATA_DIR',''),
]

print('envs:')
for k in ['HF_HUB_OFFLINE','TRANSFORMERS_OFFLINE','HF_HOME','HUGGINGFACE_HUB_CACHE','MODEL_CACHE_DIR','SLIDEFORGE_OCR_DIR','SLIDEFORGE_DATA_DIR','DATA_DIR']:
    print(k, os.environ.get(k))

seen = set()
for base in candidates:
    if not base:
        continue
    try:
        print('\nbase:', base)
        if os.path.exists(base):
            print('exists')
            try:
                for name in os.listdir(base):
                    if name.startswith('.tmp'):
                        p = os.path.join(base, name)
                        try:
                            size = sum(os.path.getsize(os.path.join(dirpath, f)) for dirpath, _, files in os.walk(p) for f in files)
                        except Exception:
                            size = 'error'
                        print('  tmpdir', name, 'size=', size)
            except Exception as e:
                print('  ls error', e)
        else:
            print('not exists')
    except Exception as e:
        print('error on base', base, e)

# quick glob search under home for .tmp.text_recognition, limited depth
home = os.path.expanduser('~')
print('\nsearching under home for .tmp.text_recognition*')
for root, dirs, files in os.walk(home):
    for d in dirs:
        if d.startswith('.tmp.text_recognition'):
            p = os.path.join(root, d)
            print('found', p)
    # limit depth
    if root.count(os.sep) - home.count(os.sep) > 4:
        dirs[:] = []

print('\ndone')
