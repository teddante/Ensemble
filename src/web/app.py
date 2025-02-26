from flask import Flask, render_template, request, jsonify
import sys
import os
import asyncio
from pathlib import Path
import logging
import functools
from werkzeug.exceptions import HTTPException

# Add the src directory to the Python path so we can import ensemble and config modules
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from config import load_config
from ensemble import init_client, fetch_llm_responses, combine_responses, refine_response

# Create Flask app with proper template and static folders
current_dir = os.path.dirname(os.path.abspath(__file__))
templates_dir = os.path.join(current_dir, "templates")
static_dir = os.path.join(current_dir, "static")

app = Flask(__name__, 
            template_folder=templates_dir,
            static_folder=static_dir)
app.config["TEMPLATES_AUTO_RELOAD"] = True

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

# Helper function to run async functions in Flask routes
def async_route(route_function):
    @functools.wraps(route_function)
    def route_wrapper(*args, **kwargs):
        try:
            loop = asyncio.get_event_loop()
        except RuntimeError:
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
        return loop.run_until_complete(route_function(*args, **kwargs))
    return route_wrapper

@app.route('/')
def index():
    """Render the main page"""
    return render_template('index.html')

@app.route('/generate', methods=['POST'])
@async_route
async def generate():
    """API endpoint to generate ensemble responses"""
    try:
        # Get prompt from request
        prompt = request.form.get('prompt', '')
        if not prompt:
            return jsonify({'error': 'No prompt provided'}), 400
        
        # Load configuration
        config = load_config()
        
        # Initialize OpenRouter client
        client = init_client(config)
        
        # Get models to use
        models = config["MODELS"]
        if not models:
            return jsonify({'error': 'No models configured'}), 400
        
        # Fetch LLM responses
        llm_responses = await fetch_llm_responses(client, prompt, models)
        
        # Combine responses
        combined_prompt = combine_responses(prompt, models, llm_responses)
        
        # Refine the response
        refinement_model = config["REFINEMENT_MODEL_NAME"]
        refined_answer = await refine_response(client, combined_prompt, refinement_model)
        
        # Prepare results to return
        results = {
            'models': models,
            'individual_responses': llm_responses,
            'refined_answer': refined_answer
        }
        
        return jsonify(results)
    
    except Exception as e:
        logging.exception("Error generating response")
        return jsonify({'error': str(e)}), 500

# Add a JSON error handler for HTTP exceptions
@app.errorhandler(HTTPException)
def handle_exception(e):
    """Return JSON instead of HTML for HTTP errors."""
    response = e.get_response()
    response.data = jsonify({
        "code": e.code,
        "name": e.name,
        "error": str(e.description),
    }).data
    response.content_type = "application/json"
    return response

def run_web_app():
    """Start the Flask web server"""
    # Ensure templates and static directories exist
    Path(templates_dir).mkdir(parents=True, exist_ok=True)
    Path(static_dir).mkdir(parents=True, exist_ok=True)
    
    # Run the Flask app
    app.run(host='0.0.0.0', port=5000, debug=True)

if __name__ == '__main__':
    run_web_app()