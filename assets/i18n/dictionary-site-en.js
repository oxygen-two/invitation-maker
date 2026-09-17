/* English copy for the landing page and the user guide.

   Kept apart from dictionary-en.js so the studio never ships a page's worth
   of marketing and FAQ text it cannot display. The engine's register()
   replaces a language's dictionary wholesale, so this file re-registers the
   main dictionary with the `site` namespace merged on top. Load order:
   i18n.js → dictionary-ko.js → dictionary-en.js → this file → the Korean one. */
(function exposeSiteDictionaryEn(root, factory) {
  const dictionary = factory();

  if (typeof module === "object" && module.exports) {
    module.exports = dictionary;
  }

  root.InvitationI18n?.register("en", { ...(root.InvitationDictionaryEn || {}), ...dictionary });
  root.InvitationSiteDictionaryEn = dictionary;
})(typeof globalThis === "object" ? globalThis : this, function createSiteDictionaryEn() {
  return {
    site: {
      meta: {
        landingTitle: "Invitation Studio · Small invitations, big moments",
        landingDescription: "Free mobile invitations with no sign-up: pick a design, fill it in, send it as a file or a link.",
        guideTitle: "How it works · Invitation Studio",
        guideDescription: "Choosing a design, filling it in, the three ways to finish, and where your data lives — on one page."
      },
      header: { tagline: "Make small days special.", guide: "How it works", cta: "Make an invitation", skip: "Skip to content", langLabel: "Language", langDescription: "Display language", navLabel: "Site" },
      footer: { brand: "INVITATION STUDIO", about: "About", guide: "How it works", data: "Your data", note: "Small invitations, big moments.", navLabel: "Footer links" },
      landing: {
        hero: {
          eyebrow: "No sign-up · Free",
          title: "Small invitations, big moments.",
          lead: "Pick a design, fill it in, send it as a file or a link.",
          cta: "Make an invitation",
          sample: "See a finished invitation first",
          imageAlt: "A finished invitation open on a phone screen"
        },
        steps: {
          title: "Three steps",
          one: { title: "01 Pick a design", text: "Birthdays, weddings, first birthdays, get-togethers. Choose a design for the occasion and see a sample right away." },
          two: { title: "02 Fill it in", text: "Add the title, date, place, and a message, then photos if you like. The preview is exactly what your guests get." },
          three: { title: "03 Keep · File · Link", text: "Keep it in this browser, download a single file, or share a public link." }
        },
        gallery: {
          title: "Designs",
          lead: "Choose by taste. Every occasion has several designs.",
          cta: "See all designs",
          bloomPortrait: "Birthday",
          wedding: "Wedding",
          firstChapter: "First birthday",
          goldenYears: "60th birthday",
          botanical: "Date",
          midnightCinema: "Event",
          altPrefix: "Invitation design sample"
        },
        trust: {
          title: "Use it with confidence",
          one: { title: "No account, no app", text: "Open it in a browser and start. We never ask for an email or a phone number." },
          two: { title: "Drafts stay in your browser", text: "Your work is saved as you go, but it is never sent to a server." },
          three: { title: "Files are yours forever, links are yours to end", text: "A downloaded file stays with you. A public link expires on its own and can be revoked whenever you want." },
          link: "Where is my data stored?"
        },
        closing: { title: "Make one now", cta: "Make an invitation" }
      },
      guide: {
        title: "How it works",
        lead: "Pick a design, fill it in, and send it the way you prefer.",
        toc: { steps: "Three steps", finish: "Three ways to finish", data: "Where your data lives", faq: "Questions" },
        steps: {
          title: "Three steps",
          one: { title: "01 Design", text: "Choose the occasion first, then tap a design card to see the sample at full size. Press 'Use this design' when it feels right. You can change the design later without losing anything you have written.", alt: "The studio's design picker" },
          two: { title: "02 Content", text: "Start with the basics: title, date, and message. The place and map link come next, and photos and effects are in collapsed sections. The preview on the right is exactly the document your guests receive.", alt: "The studio's content editor" },
          three: { title: "03 Finish", text: "Choose one of three ways to finish. Your draft is saved to this browser as you write, so you can close the tab before this step and pick up later.", alt: "The studio's finish screen" }
        },
        finish: {
          title: "Three ways to finish",
          lead: "Any of them works, and you can use more than one. The difference is where the invitation ends up.",
          head: { method: "Method", where: "Where it lives", switch: "If you change browsers", undo: "Undo" },
          library: { method: "Save to library", where: "This browser", switch: "Gone", undo: "Delete from the list" },
          file: { method: "Save as a file", where: "An HTML file on your device", switch: "The file stays", undo: "Delete the file" },
          link: { method: "Share a link", where: "Our server", switch: "The link stays alive; only this browser can revoke it", undo: "Revoke in the studio" },
          fileTitle: "What do I do with the HTML file?",
          fileText: "It is one file with the photos inside, so it opens in any browser. Attach it in a messenger or an email, or import it back into the library later to edit it."
        },
        data: {
          title: "Where your data lives",
          one: "Drafts and the library live only in this browser's storage. They are never sent to a server.",
          two: "Only public links are stored on the server. A link expires 7 days after it was last opened, and no matter how often it is opened, 30 days after publishing. An expired link no longer opens.",
          three: "A link can only be revoked from the studio in the browser that published it. If that browser is gone, the link stays until it expires.",
          four: "Public links are not indexed by search engines.",
          five: "We use visit analytics. They respect your browser's do-not-track setting, and invitation content is never sent to them.",
          six: "If you received an invitation and want a link with your details removed, ask the sender to revoke it.",
          seven: "Clearing this browser's storage also erases your drafts and library. Download a file first if you want to keep them."
        },
        faq: {
          title: "Questions",
          q1: "How many photos can I add?",
          a1: "For a shared link the whole invitation must fit in 2MB — usually three or four photos. Saving as a file has no limit.",
          q2: "A photo will not upload.",
          a2: "It may be too large or in an unsupported format. JPG and PNG from a phone almost always work. Try a different photo.",
          q3: "Will changing the design erase what I wrote?",
          a3: "No. The title, date, photos, and item order stay; only the design changes. Use Undo if you preferred the previous one.",
          q4: "Which map link should I paste?",
          a4: "Find the place in your maps app and paste the link from its Share option. Without a link, guests search the map by the place name.",
          q5: "Is the invitation's language separate from the display language?",
          a5: "Yes. The display language only affects this tool's menus and hints. What you write in the invitation is shown to guests exactly as written.",
          q6: "Can I make more than one?",
          a6: "Yes. Save several invitations to the library and pick one to continue.",
          q7: "Can I continue on another device?",
          a7: "Save it as a file, move the file to the other device, and import it into that device's library. Drafts are per browser and do not move on their own.",
          q8: "Can an expired link be restored?",
          a8: "No. Open the invitation from the library or the file and publish a new link."
        },
        closing: { title: "Ready to make one?", cta: "Make an invitation" }
      }
    }
  };
});
