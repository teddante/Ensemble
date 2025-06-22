# Add src directory to sys.path for module imports
import os
import sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'src'))

import unittest
import asyncio
from unittest.mock import patch, MagicMock, AsyncMock
import ensemble


class DummyMessage:
    def __init__(self, content):
        self.content = content


class DummyChoice:
    def __init__(self, content):
        self.message = DummyMessage(content)


class DummyResponse:
    def __init__(self, content):
        self.choices = [DummyChoice(content)]


class DummyClient:
    pass


class TestEnsembleFunctions(unittest.TestCase):
    def setUp(self):
        self.dummy_client = DummyClient()
        self.dummy_client.chat = MagicMock()
        self.dummy_client.chat.completions = MagicMock()
        # When completions.create is called, return a DummyResponse with the model name
        self.dummy_client.chat.completions.create.side_effect = lambda model, **kwargs: DummyResponse(f"Response from {model}")

    def test_fetch_llm_responses(self):
        prompt = "Test prompt"
        models = ["model1", "model2"]
        responses = asyncio.run(ensemble.fetch_llm_responses(self.dummy_client, prompt, models))
        self.assertEqual(len(responses), len(models))
        self.assertEqual(responses[0], "Response from model1")
        self.assertEqual(responses[1], "Response from model2")

    def test_combine_responses(self):
        prompt = "Test prompt"
        models = ["model1", "model2"]
        responses = ["First response", "Second response"]
        combined = ensemble.combine_responses(prompt, models, responses)
        self.assertIn("Model 1 Response (model1):", combined)
        self.assertIn("Model 2 Response (model2):", combined)
        self.assertIn("Test prompt", combined)

    def test_refine_response(self):
        combined_prompt = "Combined prompt"
        refinement_model = "refinement_model"
        # Adjust dummy to return refined message
        self.dummy_client.chat.completions.create.side_effect = lambda model, **kwargs: DummyResponse(f"Refined {model}")
        refined = asyncio.run(ensemble.refine_response(self.dummy_client, combined_prompt, refinement_model))
        self.assertEqual(refined, f"Refined {refinement_model}")


class TestEnsembleIntegration(unittest.TestCase):
    @patch('ensemble.load_config')
    @patch('ensemble.fetch_llm_responses', new_callable=AsyncMock)
    @patch('ensemble.refine_response', new_callable=AsyncMock)
    def test_main_integration(self, mock_refine, mock_fetch, mock_load_config):
        # Setup dummy config
        dummy_config = {
            "OPENROUTER_API_KEY": "dummy_api_key",
            "MODELS": ["model1"],
            "REFINEMENT_MODEL_NAME": "refinement_model",
            "PROMPT": "Integration test prompt"
        }
        mock_load_config.return_value = dummy_config
        mock_fetch.return_value = ["Response from model1"]
        mock_refine.return_value = "Refined Answer"
        
        # Patch input to prevent blocking
        with patch('ensemble.input', return_value=""):
            # Capture print output
            import io
            capturedOutput = io.StringIO()
            sys.stdout = capturedOutput
            try:
                asyncio.run(ensemble.main())
            finally:
                sys.stdout = sys.__stdout__
            self.assertIn("Refined Answer", capturedOutput.getvalue())


if __name__ == '__main__':
    unittest.main()
