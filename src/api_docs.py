"""
API documentation and OpenAPI specification for Ensemble AI.

This module provides API documentation structure and utilities for
future REST API endpoints. Currently, Ensemble AI is a CLI application,
but this prepares for potential API server functionality.
"""

from typing import Dict, Any, List, Optional
from dataclasses import dataclass, asdict
from enum import Enum
import json


class APIVersion(Enum):
    """Supported API versions."""

    V1 = "v1"


class HTTPMethod(Enum):
    """HTTP methods for API endpoints."""

    GET = "GET"
    POST = "POST"
    PUT = "PUT"
    DELETE = "DELETE"
    PATCH = "PATCH"


class ResponseFormat(Enum):
    """Supported response formats."""

    JSON = "application/json"
    TEXT = "text/plain"
    STREAM = "text/event-stream"


@dataclass
class APIResponse:
    """Standard API response structure."""

    success: bool
    data: Optional[Any] = None
    error: Optional[str] = None
    message: Optional[str] = None
    request_id: Optional[str] = None
    timestamp: Optional[str] = None

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for JSON serialization."""
        return asdict(self)


@dataclass
class EnsembleRequest:
    """Request structure for ensemble processing."""

    prompt: str
    models: Optional[List[str]] = None
    refinement_model: Optional[str] = None
    max_tokens: Optional[int] = None
    temperature: Optional[float] = None
    stream: bool = False
    include_metadata: bool = False


@dataclass
class EnsembleResponse:
    """Response structure for ensemble processing."""

    refined_response: str
    model_responses: List[Dict[str, Any]]
    processing_time: float
    models_used: List[str]
    metadata: Optional[Dict[str, Any]] = None


class OpenAPIGenerator:
    """Generate OpenAPI specification for Ensemble AI API."""

    def __init__(self, version: str = "1.0.0", title: str = "Ensemble AI API"):
        self.version = version
        self.title = title
        self.base_spec = {
            "openapi": "3.0.3",
            "info": {
                "title": title,
                "description": "Multi-LLM ensemble processing API",
                "version": version,
                "contact": {
                    "name": "Ensemble AI Support",
                    "email": "support@ensemble-ai.com",
                },
                "license": {
                    "name": "MIT",
                    "url": "https://opensource.org/licenses/MIT",
                },
            },
            "servers": [
                {
                    "url": "https://api.ensemble-ai.com/v1",
                    "description": "Production server",
                },
                {
                    "url": "https://staging-api.ensemble-ai.com/v1",
                    "description": "Staging server",
                },
                {
                    "url": "http://localhost:8000/v1",
                    "description": "Development server",
                },
            ],
            "paths": {},
            "components": {
                "schemas": {},
                "securitySchemes": {
                    "ApiKeyAuth": {
                        "type": "apiKey",
                        "in": "header",
                        "name": "X-API-Key",
                    },
                    "BearerAuth": {"type": "http", "scheme": "bearer"},
                },
            },
            "security": [{"ApiKeyAuth": []}, {"BearerAuth": []}],
        }

    def add_ensemble_endpoint(self) -> None:
        """Add ensemble processing endpoint to the specification."""
        self.base_spec["paths"]["/ensemble"] = {
            "post": {
                "summary": "Process prompt with multiple LLMs",
                "description": "Submit a prompt for processing by multiple LLMs and receive a refined response",
                "operationId": "process_ensemble",
                "tags": ["Ensemble"],
                "requestBody": {
                    "required": True,
                    "content": {
                        "application/json": {
                            "schema": {"$ref": "#/components/schemas/EnsembleRequest"}
                        }
                    },
                },
                "responses": {
                    "200": {
                        "description": "Successful processing",
                        "content": {
                            "application/json": {
                                "schema": {
                                    "$ref": "#/components/schemas/EnsembleResponse"
                                }
                            }
                        },
                    },
                    "400": {
                        "description": "Invalid request",
                        "content": {
                            "application/json": {
                                "schema": {"$ref": "#/components/schemas/ErrorResponse"}
                            }
                        },
                    },
                    "401": {
                        "description": "Unauthorized",
                        "content": {
                            "application/json": {
                                "schema": {"$ref": "#/components/schemas/ErrorResponse"}
                            }
                        },
                    },
                    "429": {
                        "description": "Rate limit exceeded",
                        "content": {
                            "application/json": {
                                "schema": {"$ref": "#/components/schemas/ErrorResponse"}
                            }
                        },
                    },
                    "500": {
                        "description": "Internal server error",
                        "content": {
                            "application/json": {
                                "schema": {"$ref": "#/components/schemas/ErrorResponse"}
                            }
                        },
                    },
                },
            }
        }

    def add_health_endpoint(self) -> None:
        """Add health check endpoint to the specification."""
        self.base_spec["paths"]["/health"] = {
            "get": {
                "summary": "Health check",
                "description": "Get the health status of the API service",
                "operationId": "health_check",
                "tags": ["Health"],
                "responses": {
                    "200": {
                        "description": "Service is healthy",
                        "content": {
                            "application/json": {
                                "schema": {
                                    "$ref": "#/components/schemas/HealthResponse"
                                }
                            }
                        },
                    },
                    "503": {
                        "description": "Service is unhealthy",
                        "content": {
                            "application/json": {
                                "schema": {
                                    "$ref": "#/components/schemas/HealthResponse"
                                }
                            }
                        },
                    },
                },
            }
        }

    def add_models_endpoint(self) -> None:
        """Add models listing endpoint to the specification."""
        self.base_spec["paths"]["/models"] = {
            "get": {
                "summary": "List available models",
                "description": "Get a list of available LLM models",
                "operationId": "list_models",
                "tags": ["Models"],
                "responses": {
                    "200": {
                        "description": "List of available models",
                        "content": {
                            "application/json": {
                                "schema": {
                                    "$ref": "#/components/schemas/ModelsResponse"
                                }
                            }
                        },
                    }
                },
            }
        }

    def add_schemas(self) -> None:
        """Add data schemas to the specification."""
        self.base_spec["components"]["schemas"] = {
            "EnsembleRequest": {
                "type": "object",
                "required": ["prompt"],
                "properties": {
                    "prompt": {
                        "type": "string",
                        "description": "The prompt to process",
                        "minLength": 1,
                        "maxLength": 10000,
                        "example": "What is machine learning?",
                    },
                    "models": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "List of model identifiers to use",
                        "example": [
                            "anthropic/claude-3-haiku-20240307",
                            "openai/gpt-4o-mini",
                        ],
                    },
                    "refinement_model": {
                        "type": "string",
                        "description": "Model to use for response refinement",
                        "example": "anthropic/claude-3-haiku-20240307",
                    },
                    "max_tokens": {
                        "type": "integer",
                        "minimum": 1,
                        "maximum": 4000,
                        "description": "Maximum tokens in response",
                    },
                    "temperature": {
                        "type": "number",
                        "minimum": 0.0,
                        "maximum": 2.0,
                        "description": "Sampling temperature",
                    },
                    "stream": {
                        "type": "boolean",
                        "description": "Whether to stream the response",
                        "default": False,
                    },
                    "include_metadata": {
                        "type": "boolean",
                        "description": "Whether to include processing metadata",
                        "default": False,
                    },
                },
            },
            "EnsembleResponse": {
                "type": "object",
                "properties": {
                    "refined_response": {
                        "type": "string",
                        "description": "The final refined response",
                    },
                    "model_responses": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "properties": {
                                "model": {"type": "string"},
                                "response": {"type": "string"},
                                "processing_time": {"type": "number"},
                                "success": {"type": "boolean"},
                            },
                        },
                        "description": "Individual model responses",
                    },
                    "processing_time": {
                        "type": "number",
                        "description": "Total processing time in seconds",
                    },
                    "models_used": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "List of models that were used",
                    },
                    "metadata": {
                        "type": "object",
                        "description": "Additional processing metadata",
                    },
                },
            },
            "HealthResponse": {
                "type": "object",
                "properties": {
                    "status": {
                        "type": "string",
                        "enum": ["healthy", "degraded", "unhealthy"],
                        "description": "Overall health status",
                    },
                    "timestamp": {
                        "type": "string",
                        "format": "date-time",
                        "description": "Health check timestamp",
                    },
                    "checks": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "properties": {
                                "name": {"type": "string"},
                                "status": {"type": "string"},
                                "message": {"type": "string"},
                                "duration": {"type": "number"},
                            },
                        },
                        "description": "Individual health check results",
                    },
                },
            },
            "ModelsResponse": {
                "type": "object",
                "properties": {
                    "models": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "properties": {
                                "id": {"type": "string"},
                                "name": {"type": "string"},
                                "provider": {"type": "string"},
                                "description": {"type": "string"},
                                "max_tokens": {"type": "integer"},
                                "available": {"type": "boolean"},
                            },
                        },
                    }
                },
            },
            "ErrorResponse": {
                "type": "object",
                "properties": {
                    "error": {"type": "string", "description": "Error message"},
                    "error_code": {
                        "type": "string",
                        "description": "Machine-readable error code",
                    },
                    "details": {
                        "type": "object",
                        "description": "Additional error details",
                    },
                    "request_id": {
                        "type": "string",
                        "description": "Request identifier for debugging",
                    },
                },
            },
        }

    def generate_spec(self) -> Dict[str, Any]:
        """Generate the complete OpenAPI specification."""
        self.add_ensemble_endpoint()
        self.add_health_endpoint()
        self.add_models_endpoint()
        self.add_schemas()
        return self.base_spec

    def to_json(self, indent: int = 2) -> str:
        """Export specification as JSON string."""
        return json.dumps(self.generate_spec(), indent=indent)

    def to_yaml(self) -> str:
        """Export specification as YAML string."""
        try:
            import yaml

            return yaml.dump(self.generate_spec(), default_flow_style=False)
        except ImportError:
            raise ImportError(
                "PyYAML is required for YAML export. Install with: pip install PyYAML"
            )


def generate_api_documentation() -> Dict[str, Any]:
    """Generate complete API documentation."""
    generator = OpenAPIGenerator()
    return generator.generate_spec()


def save_openapi_spec(output_file: str = "api_spec.json") -> None:
    """Save OpenAPI specification to file."""
    generator = OpenAPIGenerator()
    spec = generator.generate_spec()

    with open(output_file, "w") as f:
        json.dump(spec, f, indent=2)

    print(f"OpenAPI specification saved to {output_file}")


# Future API endpoint decorators and utilities
def api_endpoint(
    path: str,
    method: HTTPMethod = HTTPMethod.GET,
    tags: List[str] = None,
    summary: str = None,
):
    """
    Decorator for future API endpoint functions.

    This is a placeholder for when Ensemble AI gets REST API functionality.
    """

    def decorator(func):
        func._api_path = path
        func._api_method = method
        func._api_tags = tags or []
        func._api_summary = summary
        return func

    return decorator


def validate_request(schema_class):
    """
    Decorator for request validation.

    This is a placeholder for when Ensemble AI gets REST API functionality.
    """

    def decorator(func):
        func._validation_schema = schema_class
        return func

    return decorator


# Example usage and testing
if __name__ == "__main__":
    # Generate and display API documentation
    generator = OpenAPIGenerator()
    spec = generator.generate_spec()

    print("Generated OpenAPI Specification:")
    print(json.dumps(spec, indent=2))

    # Save to file
    save_openapi_spec("ensemble_api_spec.json")

    # Example of future endpoint decoration
    @api_endpoint(
        "/ensemble",
        HTTPMethod.POST,
        tags=["Ensemble"],
        summary="Process ensemble request",
    )
    @validate_request(EnsembleRequest)
    def process_ensemble_endpoint(request: EnsembleRequest) -> EnsembleResponse:
        """Future endpoint for ensemble processing."""
        pass

    print(f"\nExample endpoint configuration:")
    print(f"Path: {process_ensemble_endpoint._api_path}")
    print(f"Method: {process_ensemble_endpoint._api_method.value}")
    print(f"Tags: {process_ensemble_endpoint._api_tags}")
    print(f"Summary: {process_ensemble_endpoint._api_summary}")
