/**
 * Pixel Art Animations for BC Forestry Simulator
 * Oregon Trail-inspired visual enhancements
 */

/**
 * Creates regional landscape scene based on selected region
 * @param {string} region - The selected forestry region
 * @param {HTMLElement} terminal - Terminal element to insert scene into
 */
export function createRegionalLandscape(region, terminal) {
  const scene = document.createElement('div');
  scene.className = 'pixel-scene';
  
  // Regional-specific styling
  switch (region) {
    case 'Sub-Boreal Spruce (SBS)':
      scene.classList.add('landscape-sbs');
      addBeetleDamage(scene);
      break;
    case 'Interior Douglas-fir (IDF)':
      scene.classList.add('landscape-idf');
      break;
    case 'Montane Spruce (MS)':
      scene.classList.add('landscape-ms');
      addMountains(scene);
      break;
  }
  
  // Add trees to all regions
  addPixelTrees(scene);
  
  terminal.appendChild(scene);
  
  // Remove after 3 seconds
  setTimeout(() => {
    if (scene.parentNode) {
      scene.remove();
    }
  }, 3000);
}

/**
 * Creates seasonal transition animation
 * @param {number} quarter - Current quarter (1-4)
 * @param {HTMLElement} terminal - Terminal element
 */
export function playSeasonalTransition(quarter, terminal) {
  const scene = document.createElement('div');
  scene.className = 'pixel-scene';
  
  switch (quarter) {
    case 1: // Spring
      addSpringBuds(scene);
      break;
    case 2: // Summer
      addFireflies(scene);
      break;
    case 3: // Fall
      addFallingLeaves(scene);
      break;
    case 4: // Winter
      addSnowfall(scene);
      break;
  }
  
  terminal.appendChild(scene);
  
  // Remove after animation completes
  setTimeout(() => {
    if (scene.parentNode) {
      scene.remove();
    }
  }, 4000);
}

/**
 * Shows logging truck animation during operations setup
 */
export function showLoggingTruck() {
  const truck = document.createElement('div');
  truck.className = 'logging-truck';
  document.body.appendChild(truck);
  
  // Remove truck after animation
  setTimeout(() => {
    if (truck.parentNode) {
      truck.remove();
    }
  }, 8000);
}

/**
 * Creates event cut-in animation for special events
 * @param {string} eventType - Type of event
 * @param {string} message - Event message
 */
export function showEventCutIn(eventType, message) {
  const cutIn = document.createElement('div');
  cutIn.className = 'event-cutIn';
  
  // Create pixel art icon container
  const iconContainer = document.createElement('div');
  let iconClass = '';
  
  switch (eventType) {
    case 'strike':
      iconClass = 'pixel-hammer';
      break;
    case 'fire':
      iconClass = 'pixel-fire';
      break;
    case 'market':
      iconClass = 'pixel-chart';
      break;
    case 'illegal':
      iconClass = 'pixel-skull';
      break;
    case 'first_nations':
      iconClass = 'pixel-handshake';
      break;
    default:
      iconClass = 'pixel-warning';
  }
  
  iconContainer.className = iconClass;
  
  const messageDiv = document.createElement('div');
  messageDiv.style.fontSize = '16px';
  messageDiv.style.lineHeight = '1.3';
  messageDiv.style.marginTop = '10px';
  messageDiv.textContent = message;
  
  cutIn.appendChild(iconContainer);
  cutIn.appendChild(messageDiv);
  
  document.body.appendChild(cutIn);
  
  // Auto-remove after 3 seconds
  setTimeout(() => {
    if (cutIn.parentNode) {
      cutIn.remove();
    }
  }, 3000);
}

/**
 * Updates status panel with animated icons
 * @param {HTMLElement} statusPanel - Status panel element
 * @param {Object} state - Game state object
 */
export function updateStatusIcons(statusPanel, state) {
  if (!statusPanel) return;
  
  // Find all status items and add icons
  const items = statusPanel.querySelectorAll('.info-item');
  items.forEach(item => {
    const label = item.querySelector('.info-label');
    if (!label) return;
    
    const text = label.textContent.toLowerCase();
    let iconClass = 'status-icon';
    let pixelClass = '';
    
    if (text.includes('budget')) {
      pixelClass = 'pixel-money';
      if (state.budget < 100000) iconClass += ' pulse';
    } else if (text.includes('reputation')) {
      pixelClass = 'pixel-star';
      if (state.reputation < 0.3) iconClass += ' heartbeat';
    } else if (text.includes('safety')) {
      pixelClass = 'pixel-shield';
      if (state.safety_violations > 0) iconClass += ' pulse';
    } else if (text.includes('morale')) {
      if (state.crew_morale < 0.5) {
        pixelClass = 'pixel-face-sad';
      } else {
        pixelClass = 'pixel-face-happy';
      }
    } else if (text.includes('relations')) {
      pixelClass = 'pixel-handshake';
    }
    
    // Remove existing icon if present
    const existingIcon = label.querySelector('.status-icon');
    if (existingIcon) {
      existingIcon.remove();
    }
    
    // Add new pixel art icon
    if (pixelClass) {
      const iconSpan = document.createElement('span');
      iconSpan.className = `${iconClass} ${pixelClass}`;
      label.insertBefore(iconSpan, label.firstChild);
    }
  });
}

// Helper functions for creating pixel art elements

function addPixelTrees(scene) {
  for (let i = 0; i < 5; i++) {
    const tree = document.createElement('div');
    tree.className = 'pixel-tree';
    tree.style.left = `${20 + i * 60}px`;
    tree.style.animationDelay = `${i * 0.5}s`;
    scene.appendChild(tree);
  }
}

function addBeetleDamage(scene) {
  for (let i = 0; i < 3; i++) {
    const damage = document.createElement('div');
    damage.className = 'beetle-damage';
    damage.style.left = `${40 + i * 80}px`;
    damage.style.bottom = '15px';
    scene.appendChild(damage);
  }
}

function addMountains(scene) {
  for (let i = 0; i < 4; i++) {
    const mountain = document.createElement('div');
    mountain.className = 'mountain';
    mountain.style.left = `${i * 70}px`;
    mountain.style.zIndex = 4 - i;
    scene.appendChild(mountain);
  }
}

function addSpringBuds(scene) {
  for (let i = 0; i < 20; i++) {
    const bud = document.createElement('div');
    bud.className = 'spring-bud';
    bud.style.left = `${Math.random() * 280}px`;
    bud.style.top = `${Math.random() * 80 + 20}px`;
    bud.style.animationDelay = `${Math.random() * 2}s`;
    scene.appendChild(bud);
  }
}

function addFallingLeaves(scene) {
  for (let i = 0; i < 15; i++) {
    const leaf = document.createElement('div');
    leaf.className = 'fall-leaf';
    leaf.style.left = `${Math.random() * 280}px`;
    leaf.style.animationDelay = `${Math.random() * 3}s`;
    leaf.style.animationDuration = `${3 + Math.random() * 2}s`;
    scene.appendChild(leaf);
  }
}

function addSnowfall(scene) {
  for (let i = 0; i < 25; i++) {
    const snowflake = document.createElement('div');
    snowflake.className = 'snowflake';
    snowflake.style.left = `${Math.random() * 280}px`;
    snowflake.style.animationDelay = `${Math.random() * 4}s`;
    snowflake.style.animationDuration = `${3 + Math.random() * 3}s`;
    scene.appendChild(snowflake);
  }
}

function addFireflies(scene) {
  for (let i = 0; i < 8; i++) {
    const firefly = document.createElement('div');
    firefly.className = 'firefly';
    firefly.style.left = `${Math.random() * 260 + 10}px`;
    firefly.style.top = `${Math.random() * 80 + 20}px`;
    firefly.style.animationDelay = `${Math.random() * 2}s`;
    firefly.style.animationDuration = `${2 + Math.random() * 2}s`;
    scene.appendChild(firefly);
  }
}

/**
 * Creates a CEO portrait with special styling for Don Kayne
 * @param {string} ceoName - Name of the CEO
 * @returns {HTMLElement} Portrait element
 */
export function createCEOPortrait(ceoName) {
  const portrait = document.createElement('div');
  portrait.className = 'ceo-portrait';
  
  if (ceoName === 'Don Kayne') {
    portrait.classList.add('don-kayne');
  }
  
  // Add simple pixel art initials
  const initials = ceoName.split(' ').map(name => name[0]).join('');
  portrait.textContent = initials;
  portrait.style.display = 'flex';
  portrait.style.alignItems = 'center';
  portrait.style.justifyContent = 'center';
  portrait.style.fontSize = '24px';
  portrait.style.fontWeight = 'bold';
  
  return portrait;
}