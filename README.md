# Ensemble - Multi-LLM Intelligence

A modern web application that queries multiple Large Language Models simultaneously and synthesizes their responses into a single, optimal answer.

![Ensemble UI](docs/screenshot.png)

## Features

- **Multi-LLM Querying**: Send prompts to Claude, GPT-4, Gemini, and other models in parallel
- **Response Synthesis**: AI-powered combination of diverse perspectives into one refined answer
- **Real-time Streaming**: Watch responses arrive token-by-token via Server-Sent Events
- **Beautiful Dark UI**: Glassmorphic design with smooth animations
- **Persistent Settings**: API key and preferences saved locally

## Quick Start

### Prerequisites
- Node.js 18+
- OpenRouter API Key ([Get one here](https://openrouter.ai/keys))

### Installation

```bash
# Clone repository
git clone https://github.com/your-username/ensemble.git
cd ensemble

# Install dependencies
npm install

# Start development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) and enter your OpenRouter API key in Settings.

## Available Models

| Model | Provider | Description |
|-------|----------|-------------|
| Claude 3.5 Sonnet | Anthropic | Most intelligent Claude model |
| GPT-4o | OpenAI | Flagship multimodal model |
| Gemini 2.0 Flash | Google | Latest experimental (Free) |
| Claude 3 Haiku | Anthropic | Fast and affordable |
| GPT-4o Mini | OpenAI | Budget-friendly option |
| Llama 3.1 70B | Meta | Open source model |
| Mistral Large | Mistral | Flagship model |
| DeepSeek Chat | DeepSeek | V3 model |

## Tech Stack

- **Framework**: Next.js 15 (App Router)
- **Language**: TypeScript
- **Styling**: Tailwind CSS + Custom CSS
- **API**: OpenRouter SDK with SSE streaming
- **Icons**: Lucide React

## Project Structure

```
src/
├── app/
│   ├── api/generate/route.ts   # SSE streaming endpoint
│   ├── globals.css             # Design system
│   ├── layout.tsx              # Root layout
│   └── page.tsx                # Main page
├── components/
│   ├── Header.tsx
│   ├── SettingsModal.tsx
│   ├── PromptInput.tsx
│   ├── ModelSelector.tsx
│   ├── ResponsePanel.tsx
│   └── SynthesizedResponse.tsx
├── hooks/
│   └── useSettings.tsx         # Settings context
├── lib/
│   ├── openrouter.ts           # API client
│   └── validation.ts           # Input validation
└── types/
    └── index.ts                # TypeScript types
```

## Scripts

```bash
npm run dev      # Start development server
npm run build    # Build for production
npm run start    # Start production server
npm run lint     # Run ESLint
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Run tests and linting
5. Submit a pull request

See [CONTRIBUTING.md](CONTRIBUTING.md) for detailed guidelines.

## License

MIT License - see [LICENSE](LICENSE) file for details.
