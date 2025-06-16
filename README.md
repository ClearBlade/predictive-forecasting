# Component Template Repository

This repository serves as a template for creating new components in the ClearBlade Intelligent Assets platform. It provides a standardized structure and configuration for developing React-based micro-frontends.

## Getting Started

### Component Repository Creation

1. Create a new repository from this template:
   - In GitHub, on the page for this repository, select `Use this template` -> `Create a new repository`
   - Fill out your desired owner and repository name
   - The repository's visibility must be set to public

2. Repository Naming Rules:
   - Standard repository naming convention

3. Once created, clone locally and install dependencies:
   ```bash
   npm install
   ```

## Development

### Available Scripts

- `npm start` - Start MFE server
- `npm run build` - Build the MFE for production
- `npm run build:library` - Build the component library
- `npm run build:service` - Build the service

### Project Structure

The project structure is similar to any ClearBlade system exported using `cb-cli`

```
├── src/                 # Services/Libraries source code
├── mfe/                 # Micro-frontend source code
├── cb-dev-kit/          # Development kit configuration
├── webpack.config.js    # Webpack configuration
├── tsconfig.json        # TypeScript configuration
└── package.json         # Project dependencies and scripts
```

## Dependencies

This template includes several key dependencies:
- React 17
- Material-UI 4
- TypeScript
- Single-SPA for micro-frontend architecture
- ESLint and Prettier for code quality

## Documentation

For more detailed information about creating components, please visit our 
[IA documentation](https://clearblade.atlassian.net/wiki/x/FQB6ug).

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
