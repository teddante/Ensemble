#!/bin/bash

# Ensemble Installation Script
# This script helps install dependencies and set up the environment

set -e  # Exit on any error

echo "🚀 Ensemble AI Installation Script"
echo "=================================="

# Check Python version
python_version=$(python3 --version 2>&1 | grep -oP '\d+\.\d+' || echo "unknown")
echo "📋 Detected Python version: $python_version"

if [[ "$python_version" < "3.9" ]]; then
    echo "❌ Error: Python 3.9 or higher is required"
    echo "   Current version: $python_version"
    exit 1
fi

# Check if we're in a virtual environment
if [[ -z "$VIRTUAL_ENV" ]]; then
    echo "⚠️  Warning: Not in a virtual environment"
    echo "   It's recommended to use a virtual environment:"
    echo "   python3 -m venv venv"
    echo "   source venv/bin/activate"
    echo ""
    read -p "Continue anyway? (y/N): " continue_install
    if [[ "$continue_install" != "y" && "$continue_install" != "Y" ]]; then
        echo "Installation cancelled."
        exit 0
    fi
fi

echo "📦 Installing dependencies..."

# Try pip install with different methods
install_success=false

# Method 1: Try regular pip install
echo "   Attempting regular pip install..."
if pip install -r requirements.txt; then
    install_success=true
    echo "✅ Dependencies installed successfully"
else
    echo "❌ Regular pip install failed"
    
    # Method 2: Try with --user flag
    echo "   Attempting pip install with --user flag..."
    if pip install --user -r requirements.txt; then
        install_success=true
        echo "✅ Dependencies installed successfully (user-level)"
    else
        echo "❌ User-level install failed"
        
        # Method 3: Try with --break-system-packages (for some Linux distributions)
        echo "   Attempting pip install with --break-system-packages..."
        if pip install --break-system-packages -r requirements.txt; then
            install_success=true
            echo "✅ Dependencies installed successfully (system packages)"
        else
            echo "❌ All pip install methods failed"
        fi
    fi
fi

if [ "$install_success" = false ]; then
    echo ""
    echo "❌ Installation failed. Please try one of these alternatives:"
    echo ""
    echo "1. Use Docker (recommended):"
    echo "   docker build -t ensemble ."
    echo "   docker run -e OPENROUTER_API_KEY=your_key ensemble"
    echo ""
    echo "2. Install in a virtual environment:"
    echo "   python3 -m venv venv"
    echo "   source venv/bin/activate"
    echo "   pip install -r requirements.txt"
    echo ""
    echo "3. Install system packages (Ubuntu/Debian):"
    echo "   sudo apt update"
    echo "   sudo apt install python3-pip python3-venv"
    echo "   sudo apt install python3-openai python3-pydantic python3-bleach"
    echo ""
    exit 1
fi

# Check if configuration exists
if [ ! -f ".env" ]; then
    echo ""
    echo "🔧 Setting up configuration..."
    if [ -f "default.env" ]; then
        cp default.env .env
        echo "✅ Created .env file from default.env"
        echo "⚠️  Please edit .env and add your OpenRouter API key"
        echo "   Get one at: https://openrouter.ai"
    else
        echo "❌ default.env not found"
    fi
else
    echo "✅ Configuration file (.env) already exists"
fi

# Test basic functionality
echo ""
echo "🧪 Running basic tests..."

# Test imports
python3 -c "
import sys
sys.path.insert(0, 'src')

try:
    from config import load_config
    print('✅ Config module loads successfully')
except Exception as e:
    print(f'❌ Config module failed: {e}')

try:
    from validation import sanitize_prompt
    print('✅ Validation module loads successfully')
except Exception as e:
    print(f'❌ Validation module failed: {e}')

try:
    from ensemble import main
    print('✅ Main ensemble module loads successfully')
except Exception as e:
    print(f'❌ Main ensemble module failed: {e}')
"

# Check configuration
echo ""
echo "🔍 Checking configuration..."
python3 -c "
import sys
sys.path.insert(0, 'src')
from config import load_config

try:
    config = load_config()
    models = config.get('MODELS', [])
    api_key = config.get('OPENROUTER_API_KEY', '')
    
    print(f'✅ Configuration loaded')
    print(f'   Models configured: {len(models)}')
    
    if not api_key or 'replace' in api_key.lower():
        print('⚠️  OpenRouter API key not configured')
        print('   Please set OPENROUTER_API_KEY in .env file')
    else:
        print('✅ API key configured')
        
except Exception as e:
    print(f'❌ Configuration check failed: {e}')
"

echo ""
echo "🎉 Installation completed!"
echo ""
echo "Next steps:"
echo "1. Edit .env file and add your OpenRouter API key:"
echo "   OPENROUTER_API_KEY=your_actual_api_key_here"
echo ""
echo "2. Run the application:"
echo "   python src/ensemble.py"
echo ""
echo "3. Or use Docker:"
echo "   docker-compose up"
echo ""
echo "4. For development:"
echo "   pip install -r requirements-dev.txt"
echo "   pytest tests/"
echo ""
echo "📚 See README.md for detailed usage instructions"