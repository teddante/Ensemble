# Contributing to Ensemble

Thank you for your interest in contributing to Ensemble! This document provides guidelines and steps for contributing.

## Development Setup

1. **Fork and clone** the repository
2. **Install dependencies**: `npm install`
3. **Start dev server**: `npm run dev`
4. **Open** [http://localhost:3000](http://localhost:3000)

## Code Style

- Use TypeScript for all new code
- Follow existing patterns in the codebase
- Use meaningful variable and function names
- Add comments for complex logic

## Commit Messages

Use conventional commit format:
- `feat:` New features
- `fix:` Bug fixes
- `docs:` Documentation changes
- `style:` Code style changes (formatting, etc.)
- `refactor:` Code refactoring
- `test:` Adding or updating tests
- `chore:` Maintenance tasks

## Pull Request Process

1. Create a feature branch from `main`
2. Make your changes
3. Run `npm run lint` and fix any issues
4. Run `npm run build` to ensure it compiles
5. Write a clear PR description
6. Request review from maintainers

## Adding New Models

To add a new model to the selector:

1. Open `src/types/index.ts`
2. Add the model to the `DEFAULT_MODELS` array:

```typescript
{
  id: 'provider/model-name',
  name: 'Display Name',
  provider: 'Provider',
  description: 'Brief description'
}
```

## Reporting Issues

When reporting bugs, please include:
- Steps to reproduce
- Expected behavior
- Actual behavior
- Browser and OS information
- Console errors (if any)

## Questions?

Open an issue for any questions about contributing!