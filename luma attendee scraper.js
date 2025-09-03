(async function() {
  console.log('Starting Luma guest scraper...');
  
  // First, we need to open the guest list modal
  // Look for the "117 Going" or guest count button
  const guestButton = Array.from(document.querySelectorAll('*')).find(el => {
    const text = el.textContent;
    return text && (text.includes('Going') || text.includes('Guests') || /\d+\s+(Going|Guests)/.test(text));
  });
  
  if (guestButton) {
    console.log('Found guest button:', guestButton.textContent);
    guestButton.click();
    
    // Wait for modal to load
    await new Promise(r => setTimeout(r, 2000));
  } else {
    console.log('Could not find guest list button. Looking for existing guest list...');
  }
  
  // Now look for guests in the modal or on the page
  const guestSelectors = [
    // Look for the guest names we can see in your screenshot
    '[class*="guest"] a',
    '[class*="Guest"] a', 
    '[class*="attendee"] a',
    '[class*="Attendee"] a',
    '[class*="participant"] a',
    // Look for modal content
    '[role="dialog"] a[href*="/user/"]',
    '[class*="modal"] a[href*="/user/"]',
    '[class*="Modal"] a[href*="/user/"]',
    // Generic patterns for user links
    'a[href*="/user/"]',
    'a[href*="/profile/"]'
  ];
  
  let attendees = [];
  const seen = new Set();
  
  for (const selector of guestSelectors) {
    const links = Array.from(document.querySelectorAll(selector));
    console.log(`Selector "${selector}" found ${links.length} links`);
    
    for (const link of links) {
      const href = link.getAttribute('href');
      if (!href) continue;
      
      const url = href.startsWith('http') ? href : (location.origin + href);
      const name = link.textContent.trim();
      
      // Skip if already seen or if it's the host
      if (seen.has(url) || !name || name.length < 2) continue;
      if (name.toLowerCase().includes('sean voigt')) continue; // Skip host
      
      seen.add(url);
      attendees.push({
        name: name,
        profileUrl: url
      });
    }
  }
  
  // If we still don't find attendees in the modal, try a different approach
  if (attendees.length === 0) {
    console.log('No attendees found in modal. Trying text-based extraction...');
    
    // Look for text patterns that match the guest names from your image
    const guestNames = [];
    const textNodes = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_TEXT,
      null,
      false
    );
    
    let node;
    while (node = textNodes.nextNode()) {
      const text = node.textContent.trim();
      // Look for names that appear to be in a guest list context
      if (text.length > 2 && text.length < 50 && 
          /^[A-Z][a-z]+ [A-Z]/.test(text) && // First Last name pattern
          !text.includes('Hosted By') &&
          !text.includes('Sean Voigt')) {
        
        // Check if this text node is near other similar names
        const parent = node.parentElement;
        if (parent && parent.textContent.includes('Guest')) {
          guestNames.push(text);
        }
      }
    }
    
    console.log('Found potential guest names:', guestNames);
  }
  
  console.log(`Found ${attendees.length} attendees (excluding host)`);
  
  if (attendees.length === 0) {
    alert('No attendees found! Make sure the guest list modal is open. Try clicking on the "117 Going" or guest count first.');
    return;
  }
  
  // Helper function to get social links
  async function getSocialLinks(profileUrl) {
    try {
      console.log(`Fetching social links for: ${profileUrl}`);
      const res = await fetch(profileUrl, { 
        credentials: 'include',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      });
      
      if (!res.ok) {
        console.log(`Failed to fetch ${profileUrl}: ${res.status}`);
        return { instagram: '', x: '', tiktok: '', linkedin: '', website: '' };
      }
      
      const html = await res.text();
      const doc = new DOMParser().parseFromString(html, 'text/html');
      
      const socialSelectors = [
        'a[href*="instagram.com"]',
        'a[href*="twitter.com"]', 
        'a[href*="x.com"]',
        'a[href*="tiktok.com"]',
        'a[href*="linkedin.com"]',
        '[class*="social"] a',
        '[data-testid*="social"] a'
      ];
      
      const result = {
        instagram: '',
        x: '',
        tiktok: '',
        linkedin: '',
        website: ''
      };
      
      for (const selector of socialSelectors) {
        const links = doc.querySelectorAll(selector);
        for (const a of links) {
          const href = a.href;
          if (/instagram\.com/i.test(href)) result.instagram = href;
          else if (/twitter\.com|x\.com/i.test(href)) result.x = href;
          else if (/tiktok\.com/i.test(href)) result.tiktok = href;
          else if (/linkedin\.com/i.test(href)) result.linkedin = href;
          else if (!/lumacdn\.com|lu\.ma/i.test(href) && !result.website) result.website = href;
        }
      }
      
      return result;
    } catch (e) {
      console.error(`Error fetching ${profileUrl}:`, e);
      return { instagram: '', x: '', tiktok: '', linkedin: '', website: '' };
    }
  }
  
  // Process all attendees
  const rows = [
    ['Name', 'Profile URL', 'Instagram', 'X', 'TikTok', 'LinkedIn', 'Website']
  ];
  
  for (const [index, attendee] of attendees.entries()) {
    console.log(`Processing ${index + 1}/${attendees.length}: ${attendee.name}`);
    const socials = await getSocialLinks(attendee.profileUrl);
    rows.push([
      attendee.name,
      attendee.profileUrl,
      socials.instagram,
      socials.x,
      socials.tiktok,
      socials.linkedin,
      socials.website
    ]);
    
    // Show progress and add delay
    await new Promise(r => setTimeout(r, 1000));
  }
  
  // Download CSV
  const csv = rows.map(r => r.map(x => `"${(x||'').replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], {type: 'text/csv'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `luma_guests_${new Date().toISOString().split('T')[0]}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  
  console.log(`Successfully exported ${attendees.length} guests to CSV`);
})();
