# Contributing to Tessera

Thanks for your interest in contributing to Tessera!

## Getting Started

1. Fork the repository
2. Clone your fork: `git clone https://github.com/arpitg1304/tessera.git`
3. Create a branch: `git checkout -b feature/your-feature`
4. Make your changes
5. Run tests and ensure they pass
6. Submit a pull request

## Development Setup

### Backend
```bash
cd backend
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

### Frontend
```bash
cd frontend
npm install
npm run dev
```

### Docker (Full Stack)
```bash
docker-compose up
```

## Code Style

- **Python**: Follow PEP 8, use type hints
- **TypeScript**: Use ESLint/Prettier defaults
- **Commits**: Use conventional commits (feat:, fix:, docs:, etc.)

## Pull Request Guidelines

1. Keep PRs focused on a single feature or fix
2. Update documentation if needed
3. Add tests for new functionality
4. Ensure all tests pass before submitting

## Reporting Issues

When reporting bugs, please include:
- Steps to reproduce
- Expected vs actual behavior
- Browser/OS/Python version
- Relevant logs or screenshots

## Feature Requests

Open an issue to discuss new features before implementing. This helps ensure alignment with project goals.

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
