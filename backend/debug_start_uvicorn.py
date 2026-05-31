import logging, traceback, sys

logging.basicConfig(filename='uvicorn_debug.log', level=logging.DEBUG, format='%(asctime)s %(levelname)s %(message)s')

try:
    import importlib
    m = importlib.import_module('app.main')
    app = getattr(m, 'app', None)
    logging.info("Imported app.main, app=%s", app)
    import uvicorn
    logging.info("Starting uvicorn...")
    uvicorn.run(app, host='127.0.0.1', port=8002, log_level='debug')
except Exception:
    logging.exception("Exception when starting uvicorn")
    print('Exception logged to uvicorn_debug.log')
    sys.exit(1)
