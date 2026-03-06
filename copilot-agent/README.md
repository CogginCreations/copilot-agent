# Copilot Agent

## Overview
The Copilot Agent is a TypeScript-based application that interacts with the GitHub Copilot SDK to provide stock analysis and watchlist recommendations. It leverages a custom agent designed to evaluate stocks based on various financial metrics and user-defined risk tolerance.

## Features
- Setup and configuration of the Copilot client.
- Creation of a session with a custom stock analysis agent.
- Ability to generate stock watchlists based on user input.

## Installation

1. Clone the repository:
   ```
   git clone <repository-url>
   cd copilot-agent
   ```

2. Install dependencies:
   ```
   npm install
   ```

## Configuration
Before running the application, ensure that you have set up your GitHub Copilot token. You can do this by creating a `.env` file in the root directory with the following content:
```
COPILOT_GITHUB_TOKEN=your_token_here
```

## Usage
To run the application, use the following command:
```
npm start
```

This will execute the main logic defined in `src/agent.ts`, which includes creating a session with the stock-picker agent and generating a stock watchlist.

## Contributing
Contributions are welcome! Please open an issue or submit a pull request for any enhancements or bug fixes.

## License
This project is licensed under the MIT License. See the LICENSE file for details.