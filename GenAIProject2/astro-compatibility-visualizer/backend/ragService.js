// ragService.js
// Implements Retrieval-Augmented Generation (RAG) using local knowledge base and OpenAI API.

const fs = require('fs');
const path = require('path');
const { OpenAI } = require('openai');

// Load aspect knowledge base
const aspectKnowledgePath = path.join(__dirname, '../data/aspectKnowledge.json');
let aspectKnowledge = {};
try {
  aspectKnowledge = JSON.parse(fs.readFileSync(aspectKnowledgePath, 'utf8'));
} catch (err) {
  console.error('Failed to load aspectKnowledge.json:', err);
}

// OpenAI setup (v4+)
const openaiApiKey = process.env.OPENAI_API_KEY;
const openai = openaiApiKey && openaiApiKey !== 'your-openai-api-key' ? new OpenAI({ apiKey: openaiApiKey }) : null;

/**
 * Retrieve compatibility aspect explanation
 * @param {string} aspect - e.g. "Sun-Moon"
 * @returns {object|null} - Aspect info or null if not found
 */
function getAspectExplanation(aspect) {
  return aspectKnowledge[aspect] || null;
}

/**
 * Generate compatibility summary using OpenAI
 * @param {object} person1 - { birthdate, birthtime, location, pronouns }
 * @param {object} person2 - { birthdate, birthtime, location, pronouns }
 * @param {array} aspects - list of aspect names
 * @returns {Promise<string>} - summary text
 */
// Fallback summary generator
function fallbackSummary(person1, person2, aspects) {
  let summary = `Compatibility summary for ${person1.name} and ${person2.name}:\n`;
  let romantic = `Romantic compatibility for ${person1.name} and ${person2.name}:\n`;
  let friendship = `Friendship compatibility for ${person1.name} and ${person2.name}:\n`;
  let work = `Work compatibility for ${person1.name} and ${person2.name}:\n`;
  let found = false;
  aspects.forEach(a => {
    const info = getAspectExplanation(a);
    if (info) {
      found = true;
      summary += `${a}: ${info.explanation}\n`;
      if (info.romanticMeaning) romantic += `${a}: ${info.romanticMeaning}\n`;
      if (info.friendshipMeaning) friendship += `${a}: ${info.friendshipMeaning}\n`;
      if (info.workMeaning) work += `${a}: ${info.workMeaning}\n`;
    }
  });
  if (!found) {
    summary += "No compatibility aspects found.\n";
    romantic += "No romantic compatibility found.\n";
    friendship += "No friendship compatibility found.\n";
    work += "No work compatibility found.\n";
  }
  summary += "This is a basic summary generated from the local knowledge base.";
  romantic += " This is a basic romantic compatibility summary from the local knowledge base.";
  friendship += " This is a basic friendship compatibility summary from the local knowledge base.";
  work += " This is a basic work compatibility summary from the local knowledge base.";
  return { summary, romantic, friendship, work };
}

async function generateCompatibilitySummary(person1, person2, aspects) {
  if (!openai) {
    console.log("OpenAI API not configured. Using fallback summary.");
    return fallbackSummary(person1, person2, aspects);
  }
  let prompt = `Astrology compatibility analysis for two people. Please return a JSON object with the following fields: summary, romantic, friendship, work. Each field should be a short paragraph. Use the names of the people in the text, not their pronouns.\n`;
  prompt += `Person 1: ${JSON.stringify({name: person1.name, birthdate: person1.birthdate, birthtime: person1.birthtime, location: person1.location})}\nPerson 2: ${JSON.stringify({name: person2.name, birthdate: person2.birthdate, birthtime: person2.birthtime, location: person2.location})}\n`;
  prompt += `Aspects:\n`;
  aspects.forEach(a => {
    const info = getAspectExplanation(a);
    if (info) {
      prompt += `${a}: ${info.explanation} (Romantic: ${info.romanticMeaning}, Friendship: ${info.friendshipMeaning}, Work: ${info.workMeaning}, Eval: ${info.evals})\n`;
    }
  });
  prompt += `\nGive a summary for romantic, friendship, and work compatibility.`;

  console.log("OpenAI prompt:", prompt);

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 300
    });
    const text = response.choices[0].message.content;
    console.log('OpenAI raw response:', text);
    let result;
    try {
      result = JSON.parse(text);
    } catch (e) {
      // Fallback: treat as plain text summary for all fields
      result = { summary: text, romantic: text, friendship: text, work: text };
    }
    // Ensure all fields exist
    const finalResult = {
      summary: result.summary || text,
      romantic: result.romantic || text,
      friendship: result.friendship || text,
      work: result.work || text
    };
    console.log('Final result to return:', finalResult);
    return finalResult;
  } catch (err) {
    console.error("OpenAI error:", err);
    return fallbackSummary(person1, person2, aspects);
  }
}

module.exports = {
  getAspectExplanation,
  generateCompatibilitySummary
};
