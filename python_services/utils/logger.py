import logging
import sys

def setup_logging():
    logger = logging.getLogger("python_services")
    if not logger.handlers:
        handler = logging.StreamHandler(sys.stdout)
        formatter = logging.Formatter('%(asctime)s - %(name)s - %(levelname)s - %(message)s')
        handler.setFormatter(formatter)
        logger.addHandler(handler)
        logger.setLevel(logging.INFO)
    
    # Add a bind method to simulate structlog/loguru if needed, or just return logger
    # The original code uses logger.bind(tag=TAG).info(...)
    # We can wrap it.
    class LoggerWrapper:
        def __init__(self, logger):
            self.logger = logger
        
        def bind(self, **kwargs):
            return self
        
        def info(self, msg, *args, **kwargs):
            self.logger.info(msg, *args, **kwargs)
            
        def error(self, msg, *args, **kwargs):
            self.logger.error(msg, *args, **kwargs)
            
        def warning(self, msg, *args, **kwargs):
            self.logger.warning(msg, *args, **kwargs)
            
        def debug(self, msg, *args, **kwargs):
            self.logger.debug(msg, *args, **kwargs)

    return LoggerWrapper(logger)
