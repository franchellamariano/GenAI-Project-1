# Astro Compatibility Visualizer

A web app for visualizing astrological compatibility between two people using real planetary positions, OpenAI, and a modern UI.

## Features
- Enter birth data for two people and get compatibility insights
- Accurate planetary positions and houses (Sun, Moon, Mercury, Venus, Mars, Jupiter, Saturn) using FreeAstroAPI
- Compatibility summary, romantic, friendship, and work compatibility
- Visualizes each person's birth chart as a list

## Getting Started

### Prerequisites
- Node.js (v16 or higher recommended)
- npm

### Installation
1. Clone the repository:
   ```
   git clone <your-repo-url>
   cd astro-compatibility-visualizer
   ```
2. Install dependencies:
   ```
   npm install
   ```
3. Create a `.env` file in the root directory and add your OpenAI API key:
   ```
   OPENAI_API_KEY=your-openai-api-key
   ```

### Running the App
Start the backend server:
```
npm start
```

Open your browser and go to [http://localhost:3000](http://localhost:3000)

## Environment Variables
- `OPENAI_API_KEY` (required): Your OpenAI API key for generating compatibility summaries.

## Project Structure
- `backend/` - Express backend, API integration, and astrology logic
- `frontend/` - HTML, CSS, and JS for the user interface

## License
MIT
