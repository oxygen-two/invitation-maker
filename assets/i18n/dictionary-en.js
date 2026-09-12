/* English studio copy.

   Key set is identical to dictionary-ko.js by contract (tests/i18n.test.js).

   Written short on purpose. Korean is far more compact than English, and the
   studio's controls — the three-stage nav, the mobile view tabs, the gallery
   dock buttons, the finish cards — were laid out against Korean widths. Where
   a faithful translation would wrap a button onto two lines the shorter
   wording wins: "02 Content" over "02 Edit content", "Start with this" over
   "Start with this design". */
(function exposeDictionaryEn(root, factory) {
  const dictionary = factory();

  if (typeof module === "object" && module.exports) {
    module.exports = dictionary;
  }

  root.InvitationI18n?.register("en", dictionary);
  root.InvitationDictionaryEn = dictionary;
})(typeof globalThis === "object" ? globalThis : this, function createDictionaryEn() {
  return {
    meta: {
      title: "Invitation Studio",
      description: "Pick a design you love and fill it with your own story. From birthdays to the gatherings that matter, Invitation Studio makes the invitation yours.",
      ogLocale: "en_US",
      ogTitle: "Invitation Studio · Small invitations, lasting moments",
      ogDescription: "Pick a design you love and fill it with your own story. From birthdays to the gatherings that matter, make an invitation that is yours.",
      ogImageAlt: "Envelope logo and Invitation Studio — small invitations, lasting moments",
      twitterTitle: "Invitation Studio · Small invitations, lasting moments",
      twitterDescription: "Pick a design you love, fill it with your own story, and make the invitation yours.",
      twitterImageAlt: "Envelope logo and Invitation Studio — small invitations, lasting moments",
      schemaDescription: "A free web app for making mobile invitations for birthdays, weddings, and gatherings. No sign-up: choose a design, fill in your details, and download a single HTML file with your photos inside, or share it as a link."
    },

    lang: {
      switcherLabel: "Choose language",
      switcherDescription: "Studio language"
    },

    header: {
      tagline: "Make the small days special.",
      footerNote: "Small invitations, lasting moments."
    },

    nav: {
      stepsLabel: "Steps",
      gallery: "01 Design",
      edit: "02 Content",
      finish: "03 Finish",
      library: "Library",
      viewsLabel: "Switch view",
      viewEditor: "Edit",
      viewPreview: "Preview",
      viewLibrary: "Library"
    },

    maker: {
      eyebrow: "Make it personal",
      headingGallery: "What are you celebrating?",
      headingEdit: "Make the invitation yours",
      intro: "Pick a design you love and fill it with your own story."
    },

    gallery: {
      pickerLabel: "Choose an invitation template",
      occasionQuestion: "What is the occasion?",
      occasionListLabel: "Occasion",
      designLabel: "Choose a design",
      designListLabel: "Template designs",
      showAll: "Show all",
      showAllCount: "Show all {count}",
      collapse: "Collapse",
      apply: "Use this design",
      continueToEditor: "Edit content",
      undo: "Undo",
      start: "Start with this",
      startNamed: "Start with {name}",
      keepDraft: "Keep my draft",
      applied: "In use",
      selectTemplate: "Choose the {name} template",
      selectTemplateApplied: ", currently in use",
      summaryApplied: "In use: {name}",
      summaryPending: "Selected: {name} · your draft stays as it is until you apply it.",
      summaryEmpty: "Choose a template to apply.",
      dockLabel: "Selected design",
      dockSelected: "Selected · {name}",
      dockEmpty: "Choose a design",
      dockBack: "All designs",
      applyFailed: "That template could not be applied. Your draft is unchanged."
    },

    editor: {
      detailsTitle: "The basics",
      detailsHint: "Title · date · message",
      title: "Title",
      subtitle: "Subtitle",
      dateLabel: "Date and time",
      host: "From",
      message: "Message",

      locationTitle: "Main location",
      locationHint: "Place · NAVER Map",
      location: "Place or address",
      mapUrl: "Map link",
      mapEnabled: "Show a live map for this place",

      styleTitle: "Style and effects",
      styleHint: "Intro · particles · fonts",
      introEffect: "Intro effect",
      replayIntro: "Play the intro again",
      particleEffect: "Particle effect",
      particleScale: "Particle size",
      particleScaleLabel: "Particle size scale",
      particleScaleValue: "Particle size {value}",
      particleAmount: "Particle amount",
      particleAmountLabel: "Particle amount scale",
      particleAmountValue: "Particle amount {value}",
      englishFont: "Latin font",
      koreanFont: "Korean font",

      heroTitle: "Cover background",
      heroHint: "Photo · position · zoom",

      contentTitle: "Invitation items",
      contentHint: "↑ ↓ to reorder",

      reviewButton: "Review & finish"
    },

    effects: {
      introNone: "None",
      introGroupClassic: "Classic",
      introEnvelope: "Opening envelope",
      introCardShrink: "Full-screen card",
      introGroupCinematic: "Cinematic",
      introDawn: "Fade up from dark",
      introCurtain: "Parting curtain",
      introSpotlight: "Spotlight",
      introGroupCelebration: "Celebration",
      introFireworks: "Gold fireworks",
      introGroupRomantic: "Romantic",
      introPetals: "Through the petals",
      introGroupPhoto: "Photo",
      introPhotoFocus: "Photo pull focus",

      particleNone: "None",
      particleGroupRomantic: "Romantic",
      particlePetals: "Petals",
      particleHearts: "Hearts",
      particleGroupMood: "Mood",
      particleSparkle: "Sparkles",
      particleFireflies: "Fireflies",
      particleBubbles: "Bubbles",
      particleGroupSeason: "Seasons",
      particleSnow: "Snow",
      particleLeaves: "Leaves",
      particleGroupCelebration: "Celebration",
      particleConfetti: "Confetti"
    },

    /* Korean typeface names, kept in Korean: they are the names the foundries
       ship and the names a user looking for them would recognise. Romanising
       them would make the list harder to use, not easier. */
    fonts: {
      gowunBatang: "Gowun Batang 고운바탕",
      notoSerifKr: "Noto Serif KR 노토 명조",
      nanumMyeongjo: "Nanum Myeongjo 나눔명조",
      nanumGothic: "Nanum Gothic 나눔고딕",
      songMyung: "Song Myung 송명"
    },

    hero: {
      frameLabel: "Reposition the cover background photo",
      empty: "Template background",
      add: "Add a photo",
      change: "Change photo",
      scale: "Zoom",
      scaleLabel: "Background photo zoom",
      scaleValue: "Background photo zoom {value}",
      reset: "Reset",
      resetTitle: "Reset the background photo position",
      remove: "Remove",
      removeTitle: "Remove the background photo",
      fileLabel: "Choose a cover background photo",
      processing: "{file}: processing the background photo.",
      added: "{file}: background photo added.",
      wasReset: "Background photo position and zoom reset.",
      wasRemoved: "Back to the template background."
    },

    content: {
      sectionLabel: "Invitation items",
      photoFileLabel: "Choose invitation photos",
      addCourse: "+ Course",
      addPhoto: "+ Photo",
      addNotice: "+ Notice",
      addProfile: "+ Person",
      addLink: "+ Contact",
      empty: "Add a course or a photo to build your invitation.",
      limitReached: {
        one: "You can add up to {max} item.",
        other: "You can add up to {max} items."
      },

      typeCourse: "Course",
      typePhoto: "Photo",
      typeNotice: "Notice",
      typeProfile: "Person",
      typeLink: "Contact",

      moveUp: "Move this {type} up",
      moveUpTitle: "Move up",
      moveDown: "Move this {type} down",
      moveDownTitle: "Move down",
      removeItem: "Delete this {type}",
      removeItemTitle: "Delete this item",
      confirmRemove: "Delete the “{name}” item?",

      fallbackCourse: "Course {index}",
      fallbackPhoto: "Photo {index}",
      fallbackNotice: "Notice {index}",
      fallbackProfile: "Person {index}",
      fallbackLink: "Contact {index}",

      summaryCourse: "Add a place",
      summaryPhoto: "Add a caption",
      summaryNotice: "Add your notice",
      summaryProfile: "Add someone to introduce",
      summaryLink: "Add a contact or link",
      timeUnset: "No time yet",

      courseTime: "Time",
      courseLabel: "Label",
      courseLabelSelect: "Course label",
      courseLabelCustom: "Custom",
      courseLabelPlaceholder: "e.g. EXHIBITION",
      coursePlace: "Place or address",
      courseNote: "Note",
      courseMapUrl: "Map link",
      courseMapEnabled: "Show a live map for this course",

      photoThumbnailAlt: "Preview of the chosen photo",
      photoAlt: "Alt text",
      photoCaption: "Caption",
      photoProcessing: "{file}: processing the photo.",
      photoAdded: "{file}: photo added.",
      photoFailed: "{file}: {reason}",
      photoOverCapacity: "{file}: skipped — over the number you could still add when you chose.",
      photoSkipped: "{file}: processed, but not added because of the {limit} limit.",
      limitItems: "item",
      limitPhotos: "photo",
      imageFailed: "That image could not be processed.",

      noticeHeading: "Heading",
      noticeBody: "Body",
      profileName: "Name",
      profileRole: "Role",
      profileDescription: "About",
      linkLabel: "Label",
      linkValue: "Shown as",
      linkUrl: "URL"
    },

    map: {
      loading: "Loading the map.",
      searching: "Looking up the location.",
      ready: "Location confirmed.",
      empty: "Enter a place or address.",
      pending: "Finish typing the place and we will look it up.",
      notFound: "That place was not found. Try a street address.",
      serviceUnavailable: "Location lookup is unavailable. Check the NAVER Geocoding settings.",
      unavailable: "The map could not load. Use the button below instead.",
      retry: "Try the map again"
    },

    preview: {
      /* Korean pairs the English eyebrow "Preview" with a Korean heading. In
         English that pairing becomes the same word twice, so the eyebrow
         carries a different sense of the section instead. */
      eyebrow: "Live",
      heading: "Preview",
      frameTitle: "Invitation preview",
      apply: "Apply this design",
      pendingTemplate: "This is your current draft. The “{name}” design you picked is not applied yet.",
      sample: "Design sample · what you have written is kept"
    },

    finish: {
      persistenceLead: "The library lives in this browser only.",
      persistenceBody: "Clearing your browser data or using private mode removes the drafts in your library along with it. To keep one for the long term, save it as a file or make a link below.",
      saveTitle: "Save to library",
      saveDesc: "Keep it in this browser's library and come back to it.",
      downloadTitle: "Save as a file",
      downloadDesc: "Download one HTML file with your photos inside.",
      shareTitle: "Share a link",
      shareDesc: "Publish a page anyone can open.",
      close: "Close",
      downloadDialogLead: "Download one HTML file with the photos bundled in.",
      downloadDialogStrong: "This file is the copy that lasts",
      downloadDialogTail: " — unlike the browser library, it survives changing devices or clearing storage. Keep the file and you can always open it again.",
      downloadButton: "Download HTML",
      shareDialogLead: "A public link is kept on the server, so it keeps working even if you clear this browser. But",
      shareDialogStrong: "only this browser can revoke the link",
      shareDialogTail: ", so come back here on this browser when you want to take it down.",
      shareDialogPanelLabel: "Publish a public link",
      confirmReplyContact: "This item asks for a reply but has no contact or link. Download it without a way to reply?\nCancel to go back and add one.",
      replyContactPattern: "rsvp|reply|respond|contact|attend"
    },

    library: {
      eyebrow: "Saved",
      heading: "My invitations",
      uploadLabel: "Add a downloaded HTML file",
      empty: "Nothing here yet.",
      sourceUpload: "Imported",
      sourceGenerated: "Made here",
      open: "Open",
      download: "Download",
      remove: "Delete",
      confirmRemove: "Remove “{title}” from the list?",
      untitled: "Untitled Invitation",
      unknownDate: "No date"
    },

    status: {
      draftKept: "Your draft is kept on this device",
      draftSaving: "Saving draft…",
      draftSaved: "Draft saved on this device",
      draftFailed: "Autosave failed · download it as HTML",
      draftRestored: "Restored your previous draft",
      draftUnavailable: "Autosave unavailable · download it as HTML",

      saved: "Added to your library.",
      savedUnsynchronized: "Added, but the library could not finish tidying up.",
      saveFailed: "Could not write to browser storage, so it was not added.",

      uploaded: "Invitation added.",
      uploadedUnsynchronized: "Added, but the library could not finish tidying up.",
      uploadTooLarge: "Only invitation HTML files of 10MB or less can be added.",
      uploadUnsupported: "Only HTML downloaded from this studio can be added.",

      removed: "Invitation deleted.",
      removedUnsynchronized: "Deleted, but the library could not finish refreshing.",
      removeFailed: "Could not change browser storage.",

      storageUnavailable: "The library store could not be opened. Making and downloading still work.",
      migrationUnavailable: "The existing library could not start migrating. Your existing data is untouched.",
      syncIncomplete: "The library could not finish syncing. Making and downloading still work.",
      syncFailed: "The library failed to sync. Making and downloading still work.",

      bootFailedTitle: "The starting data could not be loaded.",
      bootFailedBody: "It reads a separate JSON file, so open this from a local server or a deployment."
    }
  };
});
