"""
Input validation and sanitization utilities for Ensemble.
"""
import re
import logging
from typing import Optional, List

# Import dependencies with fallbacks
try:
    import bleach
    BLEACH_AVAILABLE = True
except ImportError:
    BLEACH_AVAILABLE = False
    logging.warning("bleach not available - HTML sanitization will be limited")

try:
    from pydantic import BaseModel, Field, validator
    PYDANTIC_AVAILABLE = True
except ImportError:
    PYDANTIC_AVAILABLE = False
    logging.warning("pydantic not available - advanced validation will be limited")
    # Create minimal fallback classes
    class BaseModel:
        def __init__(self, **kwargs):
            for key, value in kwargs.items():
                setattr(self, key, value)
        def dict(self):
            return {k: v for k, v in self.__dict__.items() if not k.startswith('_')}
    
    def Field(*args, **kwargs):
        return None
    
    def validator(*args, **kwargs):
        def decorator(func):
            return func
        return decorator

logger = logging.getLogger(__name__)

class PromptValidationError(Exception):
    """Custom exception for prompt validation errors."""
    pass

class ModelConfigValidationError(Exception):
    """Custom exception for model configuration validation errors."""
    pass

class EnsembleConfig(BaseModel):
    """Pydantic model for validating Ensemble configuration."""
    openrouter_api_key: str = Field(..., min_length=1, description="OpenRouter API key")
    models: List[str] = Field(..., min_items=1, description="List of model identifiers")
    refinement_model_name: str = Field(..., min_length=1, description="Refinement model identifier")
    prompt: Optional[str] = Field(None, description="Optional prompt")
    
    @validator('openrouter_api_key')
    def validate_api_key(cls, v):
        if not v or v.strip() == "" or "replace_me" in v.lower():
            raise ValueError("Valid OpenRouter API key is required")
        
        # Enhanced API key validation
        api_key = v.strip()
        
        # Check for common placeholder values
        invalid_values = ['your_api_key_here', 'replace_me', 'your_actual_api_key_here', 'test', 'dummy']
        if any(invalid in api_key.lower() for invalid in invalid_values):
            raise ValueError("API key appears to be a placeholder value")
        
        # Basic format validation for OpenRouter API keys
        # OpenRouter API keys typically start with 'sk-or-' followed by alphanumeric characters
        if not re.match(r'^sk-or-[a-zA-Z0-9_-]+$', api_key) and not re.match(r'^sk-[a-zA-Z0-9_-]+$', api_key):
            logger.warning("API key format may not be valid for OpenRouter - expected format: 'sk-or-...' or 'sk-...'")
        
        # Check minimum length (API keys should be reasonably long)
        if len(api_key) < 20:
            raise ValueError("API key appears to be too short to be valid")
        
        return api_key
    
    @validator('models')
    def validate_models(cls, v):
        if not v:
            raise ValueError("At least one model must be specified")
        
        valid_models = []
        for model in v:
            if not model or not model.strip():
                continue
            
            # Basic model name validation (provider/model format)
            if not re.match(r'^[a-zA-Z0-9\-_]+/[a-zA-Z0-9\-_\.]+$', model.strip()):
                logger.warning(f"Model name '{model}' may not be in correct format (provider/model)")
            
            valid_models.append(model.strip())
        
        if not valid_models:
            raise ValueError("At least one valid model must be specified")
        
        return valid_models
    
    @validator('refinement_model_name')
    def validate_refinement_model(cls, v):
        if not v or not v.strip():
            raise ValueError("Refinement model name is required")
        
        # Basic model name validation
        if not re.match(r'^[a-zA-Z0-9\-_]+/[a-zA-Z0-9\-_\.]+$', v.strip()):
            logger.warning(f"Refinement model name '{v}' may not be in correct format (provider/model)")
        
        return v.strip()

def sanitize_prompt(prompt: str, max_length: int = 10000) -> str:
    """
    Sanitize user input prompt to prevent injection attacks and ensure reasonable length.
    
    Args:
        prompt: The input prompt to sanitize
        max_length: Maximum allowed length for the prompt
        
    Returns:
        str: Sanitized prompt
        
    Raises:
        PromptValidationError: If prompt fails validation
    """
    if not prompt:
        raise PromptValidationError("Prompt cannot be empty")
    
    if not isinstance(prompt, str):
        raise PromptValidationError("Prompt must be a string")
    
    # Remove any HTML/XML tags and dangerous characters
    if BLEACH_AVAILABLE:
        sanitized = bleach.clean(prompt, tags=[], attributes={}, strip=True)
    else:
        # Fallback HTML sanitization
        import html
        sanitized = html.escape(prompt)
        # Basic HTML tag removal
        sanitized = re.sub(r'<[^>]+>', '', sanitized)
    
    # Remove excessive whitespace
    sanitized = re.sub(r'\s+', ' ', sanitized).strip()
    
    if len(sanitized) > max_length:
        logger.warning(f"Prompt truncated from {len(sanitized)} to {max_length} characters")
        sanitized = sanitized[:max_length].rsplit(' ', 1)[0] + "..."
    
    if len(sanitized) < 3:
        raise PromptValidationError("Prompt too short after sanitization")
    
    # Check for potential injection patterns
    dangerous_patterns = [
        r'<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>',
        r'javascript:',
        r'vbscript:',
        r'on\w+\s*=',
        r'data:text/html',
        r'<!--[\s\S]*?-->',
    ]
    
    for pattern in dangerous_patterns:
        if re.search(pattern, sanitized, re.IGNORECASE):
            raise PromptValidationError("Prompt contains potentially dangerous content")
    
    logger.debug(f"Prompt sanitized: {len(prompt)} -> {len(sanitized)} characters")
    return sanitized

def validate_file_path(file_path: str) -> str:
    """
    Validate and sanitize file paths to prevent directory traversal attacks.
    
    Args:
        file_path: The file path to validate
        
    Returns:
        str: Sanitized file path
        
    Raises:
        ValueError: If file path is invalid
    """
    if not file_path or not isinstance(file_path, str):
        raise ValueError("File path must be a non-empty string")
    
    # Remove dangerous path components
    sanitized = file_path.replace('..', '').replace('//', '/')
    
    # Check for absolute paths outside allowed directories
    if sanitized.startswith('/') and not sanitized.startswith('/tmp/'):
        raise ValueError("Absolute paths not allowed except in /tmp/")
    
    return sanitized

def validate_models_list(models: List[str]) -> List[str]:
    """
    Validate a list of model identifiers.
    
    Args:
        models: List of model identifiers
        
    Returns:
        List[str]: Validated model identifiers
        
    Raises:
        ModelConfigValidationError: If models list is invalid
    """
    if not models:
        raise ModelConfigValidationError("Models list cannot be empty")
    
    if not isinstance(models, list):
        raise ModelConfigValidationError("Models must be provided as a list")
    
    validated_models = []
    
    for model in models:
        if not isinstance(model, str):
            logger.warning(f"Skipping non-string model: {model}")
            continue
            
        model = model.strip()
        if not model:
            continue
            
        # Basic validation for model format
        if len(model) > 100:
            raise ModelConfigValidationError(f"Model name too long: {model}")
            
        if not re.match(r'^[a-zA-Z0-9\-_/\.]+$', model):
            raise ModelConfigValidationError(f"Invalid characters in model name: {model}")
            
        validated_models.append(model)
    
    if not validated_models:
        raise ModelConfigValidationError("No valid models found in list")
    
    if len(validated_models) > 10:
        logger.warning(f"Large number of models ({len(validated_models)}), this may impact performance")
    
    return validated_models