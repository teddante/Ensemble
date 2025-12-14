# Ensemble - Multi-LLM Intelligence

A Next.js web application that queries multiple Large Language Models simultaneously and synthesizes their responses into a single, optimal answer using AI-powered refinement.

![Ensemble UI](docs/screenshot.png)

## Features

### Core Functionality
- **Multi-LLM Querying**: Send prompts to Claude, GPT-4, Gemini, and other models in parallel
- **Response Synthesis**: AI-powered combination of diverse perspectives into one refined answer
- **Real-time Streaming**: Watch responses arrive token-by-token via Server-Sent Events
- **Chat History**: Persistent conversation history with session management
- **Reasoning Support**: Optional extended thinking/reasoning for supported models

### Production Features  
- **Rate Limiting**: Distributed rate limiting via Upstash Redis
- **Session Locking**: Prevents concurrent generation requests per session
- **API Key Encryption**: Secure client-side storage of API keys
- **Input Validation**: Comprehensive prompt and model validation
- **Error Handling**: Graceful error recovery with retry logic

### UI/UX
- **Beautiful Dark UI**: Glassmorphic design with smooth animations
- **Persistent Settings**: API key and preferences saved locally
- **Keyboard Shortcuts**: Ctrl+, for settings, Ctrl+Shift+H for history
- **Markdown Rendering**: Rich markdown with syntax highlighting

## Quick Start

### Prerequisites
- Node.js 18+
- OpenRouter API Key ([Get one here](https://openrouter.ai/keys))
- (Optional) Upstash Redis for rate limiting

### Installation

```bash
# Clone repository
git clone https://github.com/teddante/Ensemble.git
cd Ensemble

# Install dependencies
npm install

# Copy environment file
cp .env.example .env.local

# Start development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) and enter your OpenRouter API key in Settings.

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `OPENROUTER_API_KEY` | No | Default API key (can be set in UI) |
| `COOKIE_ENCRYPTION_KEY` | Prod | 32+ char key for API key encryption |
| `UPSTASH_REDIS_REST_URL` | No | Upstash Redis URL for rate limiting |
| `UPSTASH_REDIS_REST_TOKEN` | No | Upstash Redis token |

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

- **Framework**: Next.js 15 (App Router, Turbopack)
- **Language**: TypeScript 5
- **Runtime**: React 19
- **Styling**: Tailwind CSS 4 + Custom CSS
- **API**: OpenRouter SDK with SSE streaming
- **Rate Limiting**: Upstash Redis
- **Testing**: Vitest + React Testing Library + Playwright
- **Icons**: Lucide React

## Project Structure

```
src/
├── app/
│   ├── api/
│   │   ├── generate/route.ts   # SSE streaming endpoint
│   │   ├── health/route.ts     # Health check endpoint
│   │   ├── key/route.ts        # API key management
│   │   └── models/route.ts     # Model list endpoint
│   ├── globals.css             # Design system
│   ├── layout.tsx              # Root layout
│   ├── page.tsx                # Main chat page
│   ├── error.tsx               # Error boundary
│   └── not-found.tsx           # 404 page
├── components/                  # 15 React components
│   ├── ChatMessage.tsx
│   ├── ConfirmModal.tsx
│   ├── ErrorBoundary.tsx
│   ├── Header.tsx
│   ├── HistorySidebar.tsx
│   ├── MarkdownRenderer.tsx
│   ├── ModelSelector.tsx
│   ├── PromptInput.tsx
│   ├── PromptInspector.tsx
│   ├── ResponseCard.tsx
│   ├── ResponsePanel.tsx
│   ├── SettingsModal.tsx
│   └── SynthesizedResponse.tsx
├── hooks/                       # Custom React hooks
│   ├── useHistory.tsx          # Chat history management
│   ├── useModels.tsx           # Model fetching/caching
│   └── useSettings.tsx         # Settings context
├── lib/                         # Utilities and services
│   ├── constants.ts            # App constants
│   ├── crypto.ts               # Encryption utilities
│   ├── envValidation.ts        # Environment validation
│   ├── errors.ts               # Error handling
│   ├── logger.ts               # Structured logging
│   ├── openrouter.ts           # OpenRouter API client
│   ├── rateLimit.ts            # Upstash rate limiter
│   ├── sessionLock.ts          # Session lock manager
│   ├── utils.ts                # General utilities
│   └── validation.ts           # Input validation
└── types/                       # TypeScript definitions
    ├── index.ts                # Core types
    └── openrouter.types.ts     # OpenRouter API types
```

## Scripts

```bash
npm run dev          # Start development server
npm run build        # Build for production
npm run start        # Start production server
npm run lint         # Run ESLint
npm run test         # Run unit tests (Vitest)
npm run test:watch   # Run tests in watch mode
npm run test:e2e     # Run E2E tests (Playwright)
```

## Testing

The project includes comprehensive test coverage:

- **Unit Tests**: `src/**/*.test.ts` - Core logic and utilities
- **Component Tests**: `src/components/*.test.tsx` - React components
- **Hook Tests**: `src/hooks/*.test.tsx` - Custom hooks
- **E2E Tests**: `e2e/*.spec.ts` - Full user flows

```bash
# Run all tests
npm run test

# Run with coverage
npm run test -- --coverage

# Run E2E tests
npm run test:e2e
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
