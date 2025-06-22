"""
Tests for the API documentation module.
"""
import os
import sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'src'))

import unittest
import json
import tempfile
from dataclasses import asdict

from api_docs import (
    APIVersion, HTTPMethod, ResponseFormat, APIResponse, 
    EnsembleRequest, EnsembleResponse, OpenAPIGenerator,
    generate_api_documentation, save_openapi_spec,
    api_endpoint, validate_request
)


class TestDataClasses(unittest.TestCase):
    """Test API data classes."""
    
    def test_api_response(self):
        """Test APIResponse data class."""
        response = APIResponse(
            success=True,
            data={"result": "test"},
            message="Success",
            request_id="req-123"
        )
        
        self.assertTrue(response.success)
        self.assertEqual(response.data["result"], "test")
        self.assertEqual(response.message, "Success")
        self.assertEqual(response.request_id, "req-123")
        
        # Test to_dict conversion
        response_dict = response.to_dict()
        self.assertIsInstance(response_dict, dict)
        self.assertEqual(response_dict["success"], True)
    
    def test_ensemble_request(self):
        """Test EnsembleRequest data class."""
        request = EnsembleRequest(
            prompt="Test prompt",
            models=["model1", "model2"],
            refinement_model="refinement-model",
            max_tokens=1000,
            temperature=0.7,
            stream=True,
            include_metadata=True
        )
        
        self.assertEqual(request.prompt, "Test prompt")
        self.assertEqual(len(request.models), 2)
        self.assertEqual(request.refinement_model, "refinement-model")
        self.assertEqual(request.max_tokens, 1000)
        self.assertEqual(request.temperature, 0.7)
        self.assertTrue(request.stream)
        self.assertTrue(request.include_metadata)
    
    def test_ensemble_response(self):
        """Test EnsembleResponse data class."""
        response = EnsembleResponse(
            refined_response="Refined answer",
            model_responses=[
                {"model": "model1", "response": "Response 1"},
                {"model": "model2", "response": "Response 2"}
            ],
            processing_time=2.5,
            models_used=["model1", "model2"],
            metadata={"version": "1.0"}
        )
        
        self.assertEqual(response.refined_response, "Refined answer")
        self.assertEqual(len(response.model_responses), 2)
        self.assertEqual(response.processing_time, 2.5)
        self.assertEqual(len(response.models_used), 2)
        self.assertEqual(response.metadata["version"], "1.0")


class TestEnums(unittest.TestCase):
    """Test API enums."""
    
    def test_api_version(self):
        """Test APIVersion enum."""
        self.assertEqual(APIVersion.V1.value, "v1")
    
    def test_http_method(self):
        """Test HTTPMethod enum."""
        self.assertEqual(HTTPMethod.GET.value, "GET")
        self.assertEqual(HTTPMethod.POST.value, "POST")
        self.assertEqual(HTTPMethod.PUT.value, "PUT")
        self.assertEqual(HTTPMethod.DELETE.value, "DELETE")
        self.assertEqual(HTTPMethod.PATCH.value, "PATCH")
    
    def test_response_format(self):
        """Test ResponseFormat enum."""
        self.assertEqual(ResponseFormat.JSON.value, "application/json")
        self.assertEqual(ResponseFormat.TEXT.value, "text/plain")
        self.assertEqual(ResponseFormat.STREAM.value, "text/event-stream")


class TestOpenAPIGenerator(unittest.TestCase):
    """Test OpenAPI specification generation."""
    
    def setUp(self):
        """Set up test fixtures."""
        self.generator = OpenAPIGenerator()
    
    def test_generator_initialization(self):
        """Test OpenAPI generator initialization."""
        self.assertEqual(self.generator.version, "1.0.0")
        self.assertEqual(self.generator.title, "Ensemble AI API")
        self.assertIn("openapi", self.generator.base_spec)
        self.assertEqual(self.generator.base_spec["openapi"], "3.0.3")
    
    def test_custom_generator(self):
        """Test OpenAPI generator with custom parameters."""
        generator = OpenAPIGenerator(version="2.0.0", title="Custom API")
        self.assertEqual(generator.version, "2.0.0")
        self.assertEqual(generator.title, "Custom API")
        self.assertEqual(generator.base_spec["info"]["title"], "Custom API")
        self.assertEqual(generator.base_spec["info"]["version"], "2.0.0")
    
    def test_add_ensemble_endpoint(self):
        """Test adding ensemble endpoint."""
        self.generator.add_ensemble_endpoint()
        
        self.assertIn("/ensemble", self.generator.base_spec["paths"])
        ensemble_endpoint = self.generator.base_spec["paths"]["/ensemble"]
        
        self.assertIn("post", ensemble_endpoint)
        post_spec = ensemble_endpoint["post"]
        
        self.assertEqual(post_spec["summary"], "Process prompt with multiple LLMs")
        self.assertEqual(post_spec["operationId"], "process_ensemble")
        self.assertIn("Ensemble", post_spec["tags"])
        self.assertIn("requestBody", post_spec)
        self.assertIn("responses", post_spec)
        
        # Check response codes
        self.assertIn("200", post_spec["responses"])
        self.assertIn("400", post_spec["responses"])
        self.assertIn("401", post_spec["responses"])
        self.assertIn("429", post_spec["responses"])
        self.assertIn("500", post_spec["responses"])
    
    def test_add_health_endpoint(self):
        """Test adding health endpoint."""
        self.generator.add_health_endpoint()
        
        self.assertIn("/health", self.generator.base_spec["paths"])
        health_endpoint = self.generator.base_spec["paths"]["/health"]
        
        self.assertIn("get", health_endpoint)
        get_spec = health_endpoint["get"]
        
        self.assertEqual(get_spec["summary"], "Health check")
        self.assertEqual(get_spec["operationId"], "health_check")
        self.assertIn("Health", get_spec["tags"])
        
        # Check response codes
        self.assertIn("200", get_spec["responses"])
        self.assertIn("503", get_spec["responses"])
    
    def test_add_models_endpoint(self):
        """Test adding models endpoint."""
        self.generator.add_models_endpoint()
        
        self.assertIn("/models", self.generator.base_spec["paths"])
        models_endpoint = self.generator.base_spec["paths"]["/models"]
        
        self.assertIn("get", models_endpoint)
        get_spec = models_endpoint["get"]
        
        self.assertEqual(get_spec["summary"], "List available models")
        self.assertEqual(get_spec["operationId"], "list_models")
        self.assertIn("Models", get_spec["tags"])
    
    def test_add_schemas(self):
        """Test adding data schemas."""
        self.generator.add_schemas()
        
        schemas = self.generator.base_spec["components"]["schemas"]
        
        # Check required schemas
        self.assertIn("EnsembleRequest", schemas)
        self.assertIn("EnsembleResponse", schemas)
        self.assertIn("HealthResponse", schemas)
        self.assertIn("ModelsResponse", schemas)
        self.assertIn("ErrorResponse", schemas)
        
        # Check EnsembleRequest schema
        ensemble_request = schemas["EnsembleRequest"]
        self.assertEqual(ensemble_request["type"], "object")
        self.assertIn("prompt", ensemble_request["required"])
        self.assertIn("prompt", ensemble_request["properties"])
        self.assertIn("models", ensemble_request["properties"])
        
        # Check property types
        prompt_prop = ensemble_request["properties"]["prompt"]
        self.assertEqual(prompt_prop["type"], "string")
        self.assertEqual(prompt_prop["minLength"], 1)
        self.assertEqual(prompt_prop["maxLength"], 10000)
    
    def test_generate_spec(self):
        """Test complete specification generation."""
        spec = self.generator.generate_spec()
        
        # Check that all components are present
        self.assertIn("openapi", spec)
        self.assertIn("info", spec)
        self.assertIn("servers", spec)
        self.assertIn("paths", spec)
        self.assertIn("components", spec)
        self.assertIn("security", spec)
        
        # Check that endpoints were added
        self.assertIn("/ensemble", spec["paths"])
        self.assertIn("/health", spec["paths"])
        self.assertIn("/models", spec["paths"])
        
        # Check that schemas were added
        self.assertIn("schemas", spec["components"])
        self.assertGreater(len(spec["components"]["schemas"]), 0)
    
    def test_to_json(self):
        """Test JSON export."""
        json_spec = self.generator.to_json()
        
        # Should be valid JSON
        parsed = json.loads(json_spec)
        self.assertIsInstance(parsed, dict)
        self.assertIn("openapi", parsed)
    
    def test_to_yaml(self):
        """Test YAML export (if PyYAML is available)."""
        try:
            yaml_spec = self.generator.to_yaml()
            self.assertIsInstance(yaml_spec, str)
            self.assertIn("openapi:", yaml_spec)
        except ImportError:
            # PyYAML not available, skip test
            self.skipTest("PyYAML not available for YAML export test")


class TestAPIDocumentationFunctions(unittest.TestCase):
    """Test API documentation utility functions."""
    
    def test_generate_api_documentation(self):
        """Test generate_api_documentation function."""
        spec = generate_api_documentation()
        
        self.assertIsInstance(spec, dict)
        self.assertIn("openapi", spec)
        self.assertIn("info", spec)
        self.assertIn("paths", spec)
    
    def test_save_openapi_spec(self):
        """Test save_openapi_spec function."""
        with tempfile.NamedTemporaryFile(mode='w', delete=False, suffix='.json') as temp_file:
            temp_file_path = temp_file.name
        
        try:
            save_openapi_spec(temp_file_path)
            
            # Check that file was created
            self.assertTrue(os.path.exists(temp_file_path))
            
            # Check that file contains valid JSON
            with open(temp_file_path, 'r') as f:
                spec = json.load(f)
                self.assertIsInstance(spec, dict)
                self.assertIn("openapi", spec)
        finally:
            if os.path.exists(temp_file_path):
                os.unlink(temp_file_path)


class TestDecorators(unittest.TestCase):
    """Test API endpoint decorators."""
    
    def test_api_endpoint_decorator(self):
        """Test api_endpoint decorator."""
        @api_endpoint("/test", HTTPMethod.POST, tags=["Test"], summary="Test endpoint")
        def test_function():
            pass
        
        self.assertEqual(test_function._api_path, "/test")
        self.assertEqual(test_function._api_method, HTTPMethod.POST)
        self.assertEqual(test_function._api_tags, ["Test"])
        self.assertEqual(test_function._api_summary, "Test endpoint")
    
    def test_api_endpoint_decorator_defaults(self):
        """Test api_endpoint decorator with defaults."""
        @api_endpoint("/test")
        def test_function():
            pass
        
        self.assertEqual(test_function._api_path, "/test")
        self.assertEqual(test_function._api_method, HTTPMethod.GET)
        self.assertEqual(test_function._api_tags, [])
        self.assertIsNone(test_function._api_summary)
    
    def test_validate_request_decorator(self):
        """Test validate_request decorator."""
        @validate_request(EnsembleRequest)
        def test_function():
            pass
        
        self.assertEqual(test_function._validation_schema, EnsembleRequest)


class TestSpecificationContent(unittest.TestCase):
    """Test the content of generated specifications."""
    
    def setUp(self):
        """Set up test fixtures."""
        self.generator = OpenAPIGenerator()
        self.spec = self.generator.generate_spec()
    
    def test_security_schemes(self):
        """Test security schemes configuration."""
        security_schemes = self.spec["components"]["securitySchemes"]
        
        self.assertIn("ApiKeyAuth", security_schemes)
        self.assertIn("BearerAuth", security_schemes)
        
        api_key_auth = security_schemes["ApiKeyAuth"]
        self.assertEqual(api_key_auth["type"], "apiKey")
        self.assertEqual(api_key_auth["in"], "header")
        self.assertEqual(api_key_auth["name"], "X-API-Key")
        
        bearer_auth = security_schemes["BearerAuth"]
        self.assertEqual(bearer_auth["type"], "http")
        self.assertEqual(bearer_auth["scheme"], "bearer")
    
    def test_servers_configuration(self):
        """Test servers configuration."""
        servers = self.spec["servers"]
        self.assertGreater(len(servers), 0)
        
        # Check for different environments
        server_urls = [server["url"] for server in servers]
        self.assertIn("https://api.ensemble-ai.com/v1", server_urls)
        self.assertIn("https://staging-api.ensemble-ai.com/v1", server_urls)
        self.assertIn("http://localhost:8000/v1", server_urls)
    
    def test_info_section(self):
        """Test API info section."""
        info = self.spec["info"]
        
        self.assertEqual(info["title"], "Ensemble AI API")
        self.assertEqual(info["version"], "1.0.0")
        self.assertIn("description", info)
        self.assertIn("contact", info)
        self.assertIn("license", info)
        
        # Check contact information
        self.assertIn("name", info["contact"])
        self.assertIn("email", info["contact"])
        
        # Check license information
        self.assertEqual(info["license"]["name"], "MIT")
        self.assertIn("url", info["license"])


if __name__ == '__main__':
    unittest.main()