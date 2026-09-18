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
      footerNote: "Small invitations, lasting moments.",
      guideLink: "How it works",
      aboutLink: "About",
      privacyLink: "Privacy",
      termsLink: "Terms",
      footerNavLabel: "Footer links"
    },

    /* The cookie / analytics consent banner (assets/site/consent.js). It is
       injected into every page that loads analytics — the studio, the guest
       page and the local viewer included — so its copy lives here rather than
       in the site dictionaries, which only the landing, the guide and the two
       legal pages load. */
    consent: {
      regionLabel: "Cookie and analytics choice",
      message: "May we turn on visit analytics? What you write in an invitation is never sent to them.",
      privacyLink: "Read the privacy policy",
      accept: "Accept analytics",
      deny: "Essential only",
      settings: "Cookie & analytics settings"
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
      applyFailed: "That template could not be applied. Your draft is unchanged.",
      sheetTitle: "Design preview",
      sheetFrameTitle: "Design sample preview",
      sheetClose: "Close"
    },

    editor: {
      detailsTitle: "The basics",
      detailsHint: "Title · date · message",
      title: "Title",
      subtitle: "Subtitle",
      dateTime: "Date and time",
      dateTimeZone: "Time zone",
      dateCustomToggle: "Write it my own way",
      dateLabel: "Your own wording",
      dateCustomPlaceholder: "e.g. The last Saturday of summer",
      dateCustomHint: "Whatever you write here is shown exactly as typed, instead of the date above. Leave it empty and the date is written in each guest's own language.",
      host: "From",
      message: "Message",

      locationTitle: "Main location",
      locationHint: "Place · Map",
      location: "Place or address",
      mapProvider: "Map service",
      mapProviderNaver: "NAVER Map",
      mapProviderGoogle: "Google Maps",
      mapProviderHint: "NAVER Map is most accurate in Korea; Google Maps works worldwide. Guests' map buttons open in the same service.",
      mapUrl: "Map link",
      mapUrlPlaceholder: "NAVER Map or Google Maps link (optional)",
      mapEnabled: "Add a map for the main location",

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
      scriptFont: "Text font",
      scriptFontHint: "Applies to the invitation's body script.",

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
      menu: "More actions",
      menuLabel: "Actions for this {type}",
      confirmDelete: "Delete “{name}”?",
      cancel: "Cancel",

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
      courseMapUrlPlaceholder: "NAVER Map or Google Maps link (optional)",
      courseMapEnabled: "Add a map for this course",

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

      noticeHeading: "Heading",
      noticeBody: "Body",
      profileName: "Name",
      profileRole: "Role",
      profileDescription: "About",
      linkLabel: "Label",
      linkValue: "Shown as",
      linkUrl: "URL"
    },

    /* Failures that reach a person as a sentence. The modules that raise them
       throw a machine code and nothing else; the studio picks the wording here
       at the moment it prints it. */
    errors: {
      image: {
        type: "Only JPEG, PNG and WebP files can be used.",
        sourceSize: "The original image must be 15 MiB or smaller.",
        decode: "That image could not be read.",
        encodedSize: "That image could not be compressed under 600 KiB.",
        generic: "That image could not be processed."
      }
    },

    map: {
      loading: "Loading the map.",
      searching: "Looking up the location.",
      ready: "Location confirmed.",
      empty: "Enter a place or address.",
      pending: "Finish typing the place and we will look it up.",
      notFound: "That place was not found. NAVER Map only finds addresses. Enter a street address, or switch the map service to Google Maps for a place name or a place outside Korea.",
      notFoundGoogle: "That place was not found. Add more of the address or paste a map link.",
      serviceUnavailable: "Location lookup is unavailable. Check the NAVER Geocoding settings.",
      serviceUnavailableGoogle: "Location lookup is unavailable. Check the Google Maps Geocoding API settings.",
      invalidUrl: "Check the link. NAVER Map and Google Maps links are supported.",
      urlUnavailable: "This link does not include a position we can read. Guests can still open it with the map button.",
      unavailable: "The map could not load. Use the button below instead.",
      retry: "Try the map again"
    },

    /* Chrome baked INTO a generated invitation. Frozen into the downloaded
       HTML at build time, so it is rendered in the author's language and
       travels with the document. */
    invitation: {
      noticeEyebrow: "Notice",
      mapRegionLabel: "Map of the venue",
      openMap: "Open in maps",
      openMainMap: "Open the venue in maps",
      addToCalendar: "Add to calendar",
      timeZoneNote: "All times are in {zone}.",
      skipIntro: "Skip",
      skipIntroLabel: "Skip the intro",

      /* The blank invitation a studio with nothing in it starts from.
         Placeholder CONTENT for the author to overwrite, so it follows the
         language they are working in, not the language of a finished file. */
      defaultTitle: "Our special day",
      defaultSubtitle: "An invitation made for you",
      defaultLocation: "Add the venue",
      defaultMessage: "A day to walk together, talk, and remember for a long time.",
      defaultCourseMeetPlace: "Meeting point",
      defaultCourseMeetNote: "Say where to meet first.",
      defaultCourseCafePlace: "Cafe",
      defaultCourseCafeNote: "Add a good spot to sit and talk.",
      defaultCourseWalkPlace: "Walk",
      defaultCourseWalkNote: "Add a route that suits the weather.",
      defaultCourseDinnerPlace: "Dinner",
      defaultCourseDinnerNote: "Add the booking or a dish to try."
    },

    preview: {
      /* Korean pairs the English eyebrow "Preview" with a Korean heading. In
         English that pairing becomes the same word twice, so the eyebrow
         carries a different sense of the section instead. */
      eyebrow: "Live",
      heading: "Preview",
      frameTitle: "Invitation preview"
    },

    finish: {
      compareLink: "See how the three differ",
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
      shareDialogPrivacy: "A published link expires on the server 7 days after it was last opened, and 30 days after publishing at the latest. To take it down sooner, revoke it from this browser.",
      privacyLink: "Read the privacy policy",
      confirmReplyContact: "This item asks for a reply but has no contact or link. Download it without a way to reply?\nCancel to go back and add one.",
      replyContactPattern: "rsvp|reply|respond|contact|attend"
    },

    /* The publish panel. The studio talking to the author, so it follows the
       studio's language. Nothing in this section reaches a guest. */
    publish: {
      consent: "A public link lets anyone who has the address open it.",
      expiryPolicy: "The link expires 7 days after it was last opened, and 30 days after publishing at the latest.",
      limitHint: "Photos are compressed so the page stays small.",
      publishButton: "Create a public link",
      openLink: "Open link",
      copyLink: "Copy link",
      share: "Share…",
      copyMessage: "Copy invitation message",
      qrLabel: "QR code for the public link",
      revokeLink: "Revoke",
      listTitle: "Published from this browser",
      listEmpty: "Nothing published yet.",
      cardOpen: "Open",
      cardCopy: "Copy",
      cardRevoke: "Revoke",
      defaultTitle: "Shared invitation",

      noExpiry: "No automatic expiry",
      expiryUnknown: "Expiry needs checking",

      busy: "You can publish once the photos and saving have finished.",
      invalid: "Check the invitation's content first.",
      publishing: "Creating the public link.",
      published: "Public link created.",
      recovering: "Checking your previous publish request first.",
      recovered: "Checked your previous publish request.",
      publishFailed: "Publishing failed. Press again to retry the same request.",
      copied: "Link copied.",
      copyFailed: "Could not copy the link.",
      messageCopied: "Invitation message copied.",
      messageCopyFailed: "Could not copy the invitation message.",
      shareFailed: "Could not open the share sheet.",
      deleting: "Revoking the public link.",
      deleted: "Public link revoked.",
      deleteFailed: "Could not revoke the public link.",

      storageUnavailable: "Browser storage is unavailable.",
      noStorage: "Could not write to browser storage, so nothing was published.",
      storeUnreadable: "This browser's publishing record could not be read. Publishing was stopped so the existing revoke keys are not lost.",
      tooLarge: "Only invitations of 2MB or less can be published as a link.",
      tokenFailed: "Could not create a security token.",
      requestKeyFailed: "Could not create a request key.",
      badResponse: "The publish response was not valid.",
      nothingToRevoke: "There is no publishing record to revoke.",

      conflict: "This differs from your previous publish request. Try again in a moment.",
      serverTooLarge: "The invitation went over 2MB. Shrink the photos and try again.",
      rateLimited: "Publishing is rate-limited for a moment. Try again shortly.",
      storeNotReady: "The publishing server's store is not ready. Try again shortly."
    },

    library: {
      eyebrow: "Saved",
      heading: "My invitations",
      uploadLabel: "Add a downloaded HTML file",
      emptyTitle: "No invitations yet",
      emptyBody: "Finish a design here, or drop in an HTML file you downloaded, and it will show up in this list.",
      startNew: "Start a new invitation",
      dropzone: "Drop an HTML file here, or choose one",
      sourceUpload: "Imported",
      sourceGenerated: "Made here",
      open: "Open",
      download: "Download",
      remove: "Delete",
      confirmRemove: "Remove “{title}” from the list?",
      untitled: "Untitled Invitation",
      unknownDate: "No date"
    },

    /* shared.html — the page a GUEST lands on at /i/<id>. Follows the
       visitor's own browser language, not the author's: on the not-found path
       there is no author to defer to, and on the loading path we do not yet
       know who wrote what. */
    shared: {
      documentTitle: "Invitation",
      skipToContent: "Skip to content",
      brandHome: "Invitation Studio home",
      headerNote: "A small way to say it",
      footerNote: "Small invitations, lasting moments.",
      loading: "Loading the invitation.",
      frameTitle: "Shared invitation",
      backToStudio: "Back to the studio",
      expires: "Expires: {date}",

      notFoundEyebrow: "A LITTLE DETOUR",
      notFoundTitle: "This invitation could not be found.",
      notFoundDescription: "The address may have changed, or the link may no longer work.",
      notFoundHint: "If someone sent you this invitation, ask them to check the link.",

      goneEyebrow: "THIS CHAPTER IS CLOSED",
      goneTitle: "This invitation has expired.",
      goneDescription: "Its viewing period has passed, so it can no longer be opened.",
      goneHint: "Ask whoever sent it for a new link.",

      failedEyebrow: "A BRIEF PAUSE",
      failedTitle: "The invitation could not be loaded.",
      failedDescription: "Something went wrong for a moment. Please try again shortly.",
      failedHint: "If it keeps happening, come back a little later."
    },

    /* The generated static error pages (400 … 504). scripts/build-error-pages.cjs
       requires this namespace and inlines BOTH languages into every document,
       so an English reader sees English even though the served HTML is Korean
       and nothing may be fetched. Only the temporary failures carry `reload`. */
    errorPages: {
      common: {
        skipToContent: "Skip to content",
        brandHome: "Invitation Studio home",
        headerNote: "A small way to say it",
        footerNote: "Small invitations, lasting moments.",
        offline: "You appear to be offline. Check the connection, then try again.",
        reloadHint: "Use your browser's reload button to try again."
      },

      400: {
        eyebrow: "CHECK THE LINK",
        title: "Please check the link again.",
        description: "The request could not be understood. Check that the link you were given was copied in full.",
        hint: "Copy the whole link and open it in a new window.",
        action: "Back to the studio"
      },

      401: {
        eyebrow: "ACCESS REQUIRED",
        title: "This page needs to know who you are.",
        description: "Opening this page requires authentication.",
        hint: "Ask whoever sent you the link how to get in.",
        action: "Back to the studio"
      },

      403: {
        eyebrow: "PRIVATE INVITATION",
        title: "This page cannot be opened right now.",
        description: "This request does not have access to the page.",
        hint: "Ask whoever sent the link who it was shared with.",
        action: "Back to the studio"
      },

      404: {
        eyebrow: "A LITTLE DETOUR",
        title: "This page could not be found.",
        description: "The address may have changed, or the link may no longer work.",
        hint: "If someone sent you an invitation, ask them to check the link.",
        action: "Back to the studio"
      },

      408: {
        eyebrow: "TAKE A MOMENT",
        title: "The connection is taking a while.",
        description: "The request did not arrive in time. Check your network connection, then try again.",
        hint: "Check your Wi-Fi or mobile data connection.",
        action: "Back to the studio",
        reload: "Try again"
      },

      410: {
        eyebrow: "THIS CHAPTER IS CLOSED",
        title: "This link is no longer available.",
        description: "The page you asked for is no longer being served.",
        hint: "Ask whoever sent it for a new link.",
        action: "Back to the studio"
      },

      429: {
        eyebrow: "ONE MOMENT, PLEASE",
        title: "Let us pause for a moment.",
        description: "Too many requests arrived in a short time. Please try again shortly.",
        hint: "Wait a little rather than reloading again and again.",
        action: "Back to the studio",
        reload: "Try again"
      },

      500: {
        eyebrow: "A BRIEF PAUSE",
        title: "Something went wrong for a moment.",
        description: "An error came up while preparing the page. Please try again shortly.",
        hint: "If it keeps happening, come back a little later.",
        action: "Back to the studio",
        reload: "Try again"
      },

      502: {
        eyebrow: "RECONNECTING",
        title: "The connection dropped for a moment.",
        description: "The server did not send a usable response. Please try again shortly.",
        hint: "Nothing you entered needs changing. Just wait a moment.",
        action: "Back to the studio",
        reload: "Try again"
      },

      503: {
        eyebrow: "WE WILL BE RIGHT BACK",
        title: "See you again shortly.",
        description: "The service cannot be reached just now. Please come back in a little while.",
        hint: "If it keeps happening, come back a little later.",
        action: "Back to the studio",
        reload: "Try again"
      },

      504: {
        eyebrow: "A LITTLE MORE TIME",
        title: "The response is running late.",
        description: "The connection ended while waiting for the server. Please try again shortly.",
        hint: "If you were saving something, check the result before saving again.",
        action: "Back to the studio",
        reload: "Try again"
      }
    },

    /* viewer.html — the author reopening their OWN saved invitation. Follows
       the author's studio language; the invitation it rebuilds keeps the
       language baked into the saved file. */
    viewer: {
      documentTitle: "Opening the invitation",
      loadingTitle: "Loading the invitation.",
      loadingBody: "One moment please.",
      footerNote: "Small invitations, lasting moments.",
      errorTitle: "This invitation could not be opened.",
      errorBody: "Check that it is still in your library, then try again.",
      backToStudio: "Back to the studio"
    },

    status: {
      draftKept: "Your draft is kept on this device",
      draftSaving: "Saving draft…",
      draftSaved: "Draft saved on this device",
      draftFailed: "Autosave failed · download it as HTML",
      draftRestored: "Restored your previous draft",
      draftUnavailable: "Autosave unavailable · download it as HTML",
      // B-10: the phone header collapses the full sentence above to one of
      // these short labels, kept in step with whichever state is current
      // (setDraftStatus updates both). The full sentence stays the one a
      // screen reader hears; these are aria-hidden.
      draftKeptShort: "Draft",
      draftSavingShort: "Saving…",
      draftSavedShort: "Saved",
      draftFailedShort: "Not saved",
      draftRestoredShort: "Restored",
      draftUnavailableShort: "Autosave off",

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
