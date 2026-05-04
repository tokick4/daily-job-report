/**
 * Google Apps Script Backend for Daily Job Report App
 * 
 * SETUP INSTRUCTIONS:
 * 1. Create a new Google Sheet.
 * 2. Go to Extensions -> Apps Script.
 * 3. Delete any existing code and paste this entire file.
 * 4. Save the project.
 * 5. Click "Deploy" -> "New deployment".
 * 6. Select type "Web app".
 * 7. Set "Execute as" to "Me".
 * 8. Set "Who has access" to "Anyone".
 * 9. Click "Deploy" and authorize the script when prompted.
 * 10. Copy the "Web app URL" and paste it into app.js in your project.
 */

const FOLDER_NAME = "Daily Job Reports Photos";

function doPost(e) {
  try {
    // Apps script receives the payload as a string in e.postData.contents
    const data = JSON.parse(e.postData.contents);
    
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
    
    // Ensure header row exists
    if (sheet.getLastRow() === 0) {
      sheet.appendRow([
        "Timestamp", "Project", "Client", "Date", "Address", "GPS", 
        "Grading", "Issues", "Notes", "Photo Links"
      ]);
      // Make header bold
      sheet.getRange(1, 1, 1, 10).setFontWeight("bold");
    }

    // Process Photos
    let photoLinks = [];
    if (data.photos && data.photos.length > 0) {
      const folder = getOrCreateFolder(FOLDER_NAME);
      
      data.photos.forEach((photo, index) => {
        // base64 comes in format: "data:image/jpeg;base64,/9j/4AAQSkZJRg..."
        const base64Data = photo.base64.split(',')[1];
        const blob = Utilities.newBlob(Utilities.base64Decode(base64Data), 'image/jpeg', `${data.project}_${data.date}_Photo${index + 1}.jpg`);
        
        const file = folder.createFile(blob);
        file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
        
        // Add note/details to the file description if available
        if (photo.details) {
          file.setDescription(photo.details);
        }
        
        photoLinks.push(file.getUrl());
      });
    }

    // Append data to sheet
    sheet.appendRow([
      new Date(),
      data.project || "",
      data.client || "",
      data.date || "",
      data.address || "",
      data.gps || "",
      data.grading || "",
      data.issues || "",
      data.notes || "",
      photoLinks.join("\n")
    ]);

    return ContentService.createTextOutput(JSON.stringify({ 
      status: 'success', 
      message: 'Report saved successfully' 
    })).setMimeType(ContentService.MimeType.JSON);

  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({ 
      status: 'error', 
      message: error.toString() 
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

// Handle GET requests (e.g. for testing if the URL is live)
function doGet(e) {
  return ContentService.createTextOutput("Daily Job Report API is running.");
}

// Helper to find or create the target folder in Drive
function getOrCreateFolder(folderName) {
  const folders = DriveApp.getFoldersByName(folderName);
  if (folders.hasNext()) {
    return folders.next();
  } else {
    return DriveApp.createFolder(folderName);
  }
}
