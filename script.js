let queryStats = JSON.parse(localStorage.getItem('queryStats')) || {};
let awaitingSolution = false;
let currentProblem = '';
let manualSolutionMode = false;
let tempProblem = '';
let isMuted = false;
let username = '';
let waitingForUsername = true;
let feedbackGiven = false;
let chatEndTimer = null;


let allUserProfiles = JSON.parse(localStorage.getItem('allUserProfiles')) || {};

const badgeLevels = [
  { title: "Newbie", points: 0 },
  { title: "Junior Fixer", points: 15 },
  { title: "Expert Fixer", points: 30 },
  { title: "Master Fixer", points: 50 }
];

function speak(text) {
  if (isMuted || !window.voiceTriggered) return;
  if (!('speechSynthesis' in window)) return;
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'en-US';
  utterance.rate = 1;
  utterance.pitch = 1;
  window.speechSynthesis.speak(utterance);
}



const voiceBtn = document.getElementById('voice-btn');
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
const recognition = new SpeechRecognition();

recognition.continuous = false;
recognition.lang = 'en-US';
recognition.interimResults = false;
recognition.maxAlternatives = 1;

voiceBtn.addEventListener('click', () => {
  window.voiceTriggered = true;
  recognition.start();
  addMessage("Listening... Speak now.", false, null);
});


recognition.onresult = (event) => {
  const transcript = event.results[0][0].transcript;
  addMessage(`You said: "${transcript}"`, true);  // Show the transcript once
  userInput.value = transcript;
  handleUserInput();  // Process it (handleUserInput() will NOT re-add this same text)
};


recognition.onerror = (event) => {
  addMessage(`Voice error: ${event.error}`);
};

// ✅ Define default knowledge first
const defaultKnowledge = {
  "Laptop not turning on": "Check if the charger is properly connected. Try a different power outlet. If the battery is removable, remove it, hold the power button for 30 seconds, reinsert the battery, and try again.",
  "Wi-fi keeps disconnecting": "Restart your router. Forget the network on your device and reconnect. Update your network drivers.",
  "screen flickering issue": "Update your graphics driver. Adjust the screen refresh rate under Display Settings.",
  "audio not working": "Check if the device is muted. Verify the correct audio output device is selected. Update or reinstall audio drivers.",
  "blue screen error": "Note the error code. Run a memory diagnostic. Check for driver updates and Windows updates.",
  "printer not responding": "Ensure the printer is powered on and connected. Restart the printer and computer. Reinstall the printer driver.",
  "battery draining fast": "Check for background apps consuming power. Reduce screen brightness. Update the system and check for battery health.",
  "slow computer performance": "Clear temporary files. Disable startup apps. Run a malware scan. Consider upgrading RAM or SSD.",
  "overheating laptop": "Clean the air vents. Use the laptop on a hard surface. Consider a cooling pad. Update BIOS and drivers.",
  "app keeps crashing": "Update the app. Clear app cache or reinstall it. Check for system updates."
};

// ✅ Now, merge localStorage knowledge with default
let userKnowledge = JSON.parse(localStorage.getItem('chatbotKnowledge')) || {};
let troubleshootingData = { ...defaultKnowledge, ...userKnowledge };

const chatMessages = document.getElementById('chat-messages');
const userInput = document.getElementById('user-input');
const sendBtn = document.getElementById('send-btn');
const suggestionsDiv = document.getElementById('suggestions');

function addMessage(message, isUser = false, pureSpeech = null) {
  const messageWrapper = document.createElement('div');
  messageWrapper.className = `message-wrapper ${isUser ? 'user-wrap' : 'bot-wrap'}`;

  const avatar = document.createElement('div');
  avatar.className = 'avatar';
  avatar.style.backgroundImage = isUser 
    ? "url('user-avatar.png')" 
    : "url('bot-avatar.png')";

  const messageDiv = document.createElement('div');
  messageDiv.className = `message ${isUser ? 'user-message' : 'bot-message'}`;
  messageDiv.innerHTML = `${message}<div class="message-timestamp">${new Date().toLocaleTimeString()}</div>`;

  messageWrapper.appendChild(avatar);
  messageWrapper.appendChild(messageDiv);
  chatMessages.appendChild(messageWrapper);
  chatMessages.scrollTop = chatMessages.scrollHeight;
  
  if (!isUser) {
    const speechText = pureSpeech || message.replace(/<[^>]+>/g, '');
    speak(speechText);
  }
}


const muteBtn = document.getElementById('mute-btn');
muteBtn.addEventListener('click', () => {
  isMuted = !isMuted;
  muteBtn.textContent = isMuted ? '🔇' : '🔈';
});



function showSuggestions(list) {
  suggestionsDiv.innerHTML = '';
  list.forEach(text => {
    const chip = document.createElement('div');
    chip.className = 'chip';
    chip.textContent = text;
    chip.onclick = () => {
      userInput.value = text;
      handleUserInput();
    };
    suggestionsDiv.appendChild(chip);
  });
}

function updateQueryStats(query) {
  const lowerQuery = query.toLowerCase();

  // Ignore generic/single words or very short queries
  if (lowerQuery.split(" ").length < 2) return;

  queryStats[lowerQuery] = (queryStats[lowerQuery] || 0) + 1;
  localStorage.setItem('queryStats', JSON.stringify(queryStats));
}

function populateAutoFillOptions() {
  const datalist = document.getElementById('problem-list');
  datalist.innerHTML = '';
  const problems = Object.keys(troubleshootingData);
  problems.forEach(problem => {
    const option = document.createElement('option');
    option.value = problem;
    datalist.appendChild(option);
  });
}


function generateTopSuggestions() {
  const sorted = Object.entries(queryStats)
    .sort((a, b) => b[1] - a[1])
    .map(entry => entry[0]);

  const defaultKeys = Object.keys(defaultKnowledge);

  // Normalize casing and remove duplicates
  const combined = [...sorted, ...defaultKeys];
  const uniqueMap = {};
  combined.forEach(item => {
    const lower = item.toLowerCase();
    if (!uniqueMap[lower]) {
      uniqueMap[lower] = item;  // Store the first occurrence (could be capitalized)
    }
  });

  // Slice top 4 unique suggestions preserving original casing of the first occurrence
  const combinedSuggestions = Object.values(uniqueMap).slice(0, 4);
  showSuggestions(combinedSuggestions);
  
  populateAutoFillOptions();

  
}


function generateRelevantSuggestions(currentInput) {
  const relevant = [];
  const lowerInput = currentInput.toLowerCase();

  for (const problem in troubleshootingData) {
    if (problem.includes(lowerInput) || lowerInput.includes(problem)) {
      relevant.push(problem);
    }
  }

  // If relevant problems found, show them
  if (relevant.length > 0) {
    showSuggestions(relevant);
  } else {
    // Fallback to combined top + default suggestions
    generateTopSuggestions();
  }
}


function findSolution(problem) {
  problem = normalizeInput(problem);
  const options = {
    threshold: 0.4, // Lower = stricter match
    includeScore: true
  };

  const problemsList = Object.keys(troubleshootingData);
  const fuse = new Fuse(problemsList, options);
  const results = fuse.search(problem);

  if (results.length > 0) {
    const bestMatch = results[0];
    const matchedKey = bestMatch.item;

    let solutionRaw = troubleshootingData[matchedKey];

    if (typeof solutionRaw === "string") {
      solutionRaw = {
        solution: solutionRaw,
        submittedBy: "System",
        confidence: Math.round((1 - bestMatch.score) * 100),
        success: 0,
        failure: 0
      };
    } else {
      solutionRaw.confidence = Math.round((1 - bestMatch.score) * 100);
    }

    return { solution: solutionRaw };
  }

  return null;
}

function normalizeInput(input) {
  const synonyms = {
    crash: ['freeze', 'hang', 'not responding'],
    wifi: ['wireless', 'network', 'internet'],
    screen: ['display', 'monitor'],
    audio: ['sound', 'speaker'],
    battery: ['power']
  };

  for (const key in synonyms) {
    synonyms[key].forEach(alt => {
      const regex = new RegExp(`\\b${alt}\\b`, 'gi');
      input = input.replace(regex, key);
    });
  }
  return input;
}


function calculateSmartSimilarity(a, b) {
  const aWords = a.split(/\s+/);
  const bWords = b.split(/\s+/);
  const commonWords = aWords.filter(word => bWords.includes(word));
  const totalWords = new Set([...aWords, ...bWords]).size;
  return commonWords.length / totalWords;
}

function saveNewSolution(problem, solution) {
  const key = problem.toLowerCase();

  troubleshootingData[key] = {
    solution: solution,
    submittedBy: username,
    confidence: 50,
    success: 0,
    failure: 0
  };

  userKnowledge[key] = troubleshootingData[key];
  localStorage.setItem('chatbotKnowledge', JSON.stringify(userKnowledge));

  addMessage(`Thanks ${username}! I've learned how to handle "${problem}".`);

  // Reward the user for contributing
  allUserProfiles[username].points += 5;
  updateBadge(username);
  localStorage.setItem('allUserProfiles', JSON.stringify(allUserProfiles));

  showGamificationStatus();
  populateAutoFillOptions();
}


function findSimilarProblems(userQuery) {
  const userWords = userQuery.toLowerCase().split(/\s+/);
  const similar = [];

  for (const problem in troubleshootingData) {
    const problemWords = problem.toLowerCase().split(/\s+/);
    const overlap = userWords.filter(word => problemWords.includes(word));
    if (overlap.length >= 1) {  // At least 1 matching word
      similar.push(problem);
    }
  }

  return similar.slice(0, 3); // Show top 3 similar
}

function showSimilarSuggestions(problems) {
  problems.forEach(problem => {
    const btn = document.createElement('button');
    btn.className = 'suggestion-button';
    btn.textContent = problem;
    btn.onclick = () => {
      userInput.value = problem;
      handleUserInput();
    };
    chatMessages.appendChild(btn);
  });
  chatMessages.scrollTop = chatMessages.scrollHeight;
}


function showSubmitButton() {
  const submitBtn = document.createElement('button');
  submitBtn.textContent = "Submit Solution";
  submitBtn.style.padding = "10px 18px";
  submitBtn.style.borderRadius = "25px";
  submitBtn.style.background = "#2575fc";
  submitBtn.style.color = "#fff";
  submitBtn.style.border = "none";
  submitBtn.style.cursor = "pointer";
  submitBtn.style.marginTop = "10px";
  submitBtn.onclick = () => {
    awaitingSolution = true;
    addMessage("Please type the solution and hit Send.");
    submitBtn.remove();
  };
  chatMessages.appendChild(submitBtn);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

function handleUserInput() {
  const message = userInput.value.trim(); // <<< FIRST, always read user input
  
  if (!message) return;
  
  // Now check if waiting for username
  if (waitingForUsername) {
    username = message;  // no need trim again, already trimmed
  
    if (!username) {
      addMessage("Please tell me your name to continue!");
      return;
    }
  
    if (!allUserProfiles[username]) {
      allUserProfiles[username] = { points: 0, badge: 'Newbie' };
      localStorage.setItem('allUserProfiles', JSON.stringify(allUserProfiles));
    }
  
    addMessage(`Nice to meet you, ${username}!`);
    const typingDiv = document.createElement('div');
typingDiv.className = 'bot-message';
typingDiv.innerHTML = 'Bot is typing...';
typingDiv.id = 'typing-indicator';
chatMessages.appendChild(typingDiv);
chatMessages.scrollTop = chatMessages.scrollHeight;

setTimeout(() => {
  const typingElement = document.getElementById('typing-indicator');
  if (typingElement) typingElement.remove();

  addMessage(`How can I assist you today? You can describe your issue or type 'help' to see commands.`);
}, 1000);  // 1 second delay

    waitingForUsername = false;
  
    generateTopSuggestions();
    populateAutoFillOptions();
    userInput.value = '';  // Clear input after typing name
    return;
  }
  
  // After username is captured, normal bot behavior continues
  addMessage(message, true);
  userInput.value = '';
  
  if (message.toLowerCase() === 'help') {
    addMessage("Available commands:<br>- 'clear' to clear chat<br>- 'reset' to reset knowledge<br>- 'solution' to teach me<br>- 'profile' to view your profile");
    return;
  }
  
  if (message.toLowerCase() === 'profile') {
    showGamificationStatus(username);
    return;
  }
  
  // Other commands
  if (message.toLowerCase() === 'clear') {
    chatMessages.innerHTML = '';
    addMessage("Chat cleared. ✅");
    return;
  }
  
  if (message.toLowerCase() === 'reset') {
    localStorage.removeItem('chatbotKnowledge');
    localStorage.removeItem('queryStats');
    troubleshootingData = {};
    queryStats = {};
    addMessage("Knowledge and history reset. 🔄");
    generateTopSuggestions();
    return;
  }
  
  if (message.toLowerCase() === 'history') {
    addMessage("History feature coming soon!");
    return;
  }
  
  // Manual Solution Mode
  if (message.toLowerCase() === 'solution' && !manualSolutionMode) {
    manualSolutionMode = true;
    addMessage("Alright! Please type the problem you want to add a solution for.");
    return;
  }
  
  if (manualSolutionMode && !tempProblem) {
    tempProblem = message;
    addMessage(`Got it! Now please provide the solution for: "${tempProblem}"`);
    return;
  }
  
  if (manualSolutionMode && tempProblem) {
    saveNewSolution(tempProblem, message);
    addMessage("Problem and solution saved successfully! ✅");
    manualSolutionMode = false;
    tempProblem = '';
    generateTopSuggestions();
    return;
  }
  
  // If user is submitting a solution after choosing "Submit Solution"
  if (awaitingSolution) {
    saveNewSolution(currentProblem, message);
    awaitingSolution = false;
    currentProblem = '';
    generateTopSuggestions();
    return;
  }
  
  // Default flow: Try to find or suggest
  updateQueryStats(message);
  
  setTimeout(() => {
const result = findSolution(message);

if (result) {
  const solutionData = result.solution;
  const teacher = solutionData.submittedBy || 'Unknown';
  const teacherProfile = allUserProfiles[teacher] || { points: 0, badge: 'Newbie' };
  const realConfidence = solutionData.confidence || 50;

  addMessage(`(Confidence: ${realConfidence}%)<br>${solutionData.solution}<br><br><i>Taught by: ${teacher} | Badge: ${teacherProfile.badge} | Points: ${teacherProfile.points}</i>`, false, solutionData.solution);
  askForFeedback(currentProblem || message);
} else {
  const similarProblems = findSimilarProblems(message);

if (similarProblems.length > 0) {
  const suggestions = similarProblems.map(p => `<li>${p}</li>`).join('');
  addMessage(`I haven’t learned how to fix that *yet*, but users who had similar issues also asked about:<ul>${suggestions}</ul>Want to try one of these?`);
  showSimilarSuggestions(similarProblems);
} else {
  currentProblem = message;
  awaitingSolution = false;
  addMessage("Hmm, I couldn't find anything close. If you'd like to teach me how to solve this, just hit the button below.");
  showSubmitButton();
}
}

}, 700);
clearTimeout(chatEndTimer);
chatEndTimer = setTimeout(() => {
  if (!feedbackGiven) return;
  askToEndChat();
}, 5 * 60 * 1000); // 5 minutes

}

function resetChat() {
  feedbackGiven = false;
  awaitingSolution = false;
  currentProblem = '';
  tempProblem = '';
  manualSolutionMode = false;
  waitingForUsername = true;
  username = '';
  chatMessages.innerHTML = '';


  addMessage("Hi there! What's your name?");
  generateTopSuggestions();
  populateAutoFillOptions();
}

function askForFeedback(problem) {
  const feedbackDiv = document.createElement('div');
  feedbackDiv.className = 'bot-message';
  feedbackDiv.innerHTML = `Was this helpful? 
    <button style="margin:5px" onclick="feedbackYes('${problem}')">👍 Yes</button>
    <button style="margin:5px" onclick="feedbackNo('${problem}')">👎 No</button>`;
  chatMessages.appendChild(feedbackDiv);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

function feedbackYes(problem) {
  addMessage("Glad I could help! ✅");

  const problemKey = findMatchingProblemKey(problem);
  if (problemKey && troubleshootingData[problemKey]) {
    troubleshootingData[problemKey].success += 1;
    recalculateConfidence(problemKey);
    localStorage.setItem('chatbotKnowledge', JSON.stringify(userKnowledge));
  }
  feedbackGiven = true;
  askToEndChat();

}

function feedbackNo(problem) {
  const problemKey = findMatchingProblemKey(problem);
  if (problemKey && troubleshootingData[problemKey]) {
    troubleshootingData[problemKey].failure += 1;
    recalculateConfidence(problemKey);
    localStorage.setItem('chatbotKnowledge', JSON.stringify(userKnowledge));

    addMessage("Sorry this didn’t help. Would you like to update the solution?");
    showUpdateChoiceButtons(problemKey);
  } else {
    addMessage("This problem isn’t stored yet. You can add a new solution using the 'solution' command.");
  }
  feedbackGiven = true;
  askToEndChat();

}

function askToEndChat() {
  const msg = document.createElement('div');
  msg.className = 'bot-message';

  const yesBtn = document.createElement('button');
  yesBtn.textContent = "Yes";
  yesBtn.style.margin = "5px";
  yesBtn.onclick = () => {
    msg.remove();
    addMessage("Chat ended. You can start a new issue anytime.");
    setTimeout(() => {
      resetChat();  // Trigger reset AFTER message
    }, 500); // short delay to allow "chat ended" to appear first
  };

  const noBtn = document.createElement('button');
  noBtn.textContent = "No";
  noBtn.style.margin = "5px";
  noBtn.onclick = () => {
    msg.remove();
    addMessage("Great! What else can I help you with?");
  };

  msg.innerHTML = "Would you like to end this chat?";
  msg.appendChild(yesBtn);
  msg.appendChild(noBtn);
  chatMessages.appendChild(msg);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}


function showUpdateChoiceButtons(problemKey) {
  const container = document.createElement('div');
  container.className = 'bot-message';

  const yesBtn = document.createElement('button');
  yesBtn.textContent = "Yes";
  yesBtn.style.margin = "5px";
  yesBtn.onclick = () => {
    addMessage("Please provide the improved solution.");
    awaitingSolution = true;
    currentProblem = problemKey;
    container.remove();
  };

  const noBtn = document.createElement('button');
  noBtn.textContent = "No";
  noBtn.style.margin = "5px";
  noBtn.onclick = () => {
    addMessage("No worries. Let me know if you need anything else!");
    container.remove();
  };

  container.appendChild(document.createTextNode("Would you like to update the solution? "));
  container.appendChild(yesBtn);
  container.appendChild(noBtn);
  chatMessages.appendChild(container);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}


function findMatchingProblemKey(problem) {
  const lowerProblem = problem.toLowerCase();
  for (const key in troubleshootingData) {
    if (lowerProblem.includes(key.toLowerCase()) || key.toLowerCase().includes(lowerProblem)) {
      return key;
    }
  }
  return null;
}

function recalculateConfidence(problemKey) {
  const data = troubleshootingData[problemKey];
  const total = data.success + data.failure;
  if (total === 0) {
    data.confidence = 50;
  } else {
    data.confidence = Math.round((data.success / total) * 100);
  }
  userKnowledge[problemKey] = data;
}


// Event Listeners
sendBtn.addEventListener('click', handleUserInput);
userInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') handleUserInput(); });

// Initial bot message and suggestions
addMessage("Hi there! What's your name?", false, null);  // disable speech



function updateBadge(user) {
  const userData = allUserProfiles[user];
  for (let i = badgeLevels.length - 1; i >= 0; i--) {
    if (userData.points >= badgeLevels[i].points) {
      userData.badge = badgeLevels[i].title;
      break;
    }
  }
}

function showGamificationStatus(user) {
  const userData = allUserProfiles[user];
  let profileText = `🏆 <b>${user}'s Profile</b><br>`;
  profileText += `Points: ${userData.points}<br>`;
  profileText += `Current Badge: <b>${userData.badge}</b><br><br>`;
  profileText += `<b>Badge Levels:</b><br>`;
  badgeLevels.forEach(level => {
    profileText += `- ${level.title}: ${level.points} points<br>`;
  });
  const nextLevel = badgeLevels.find(level => level.points > userData.points);
  if (nextLevel) {
    const pointsNeeded = nextLevel.points - userData.points;
    profileText += `<br>Points to next badge (<b>${nextLevel.title}</b>): ${pointsNeeded} points`;
  } else {
    profileText += `<br>You have the highest badge!`;
  }
  addMessage(profileText);
}
