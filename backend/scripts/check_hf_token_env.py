import os
print('HF_HUB_TOKEN present:', 'HF_HUB_TOKEN' in os.environ)
print('HF_HUB_TOKEN len:', len(os.environ.get('HF_HUB_TOKEN','')))
