/* English copy for the landing page and the user guide.

   Kept apart from dictionary-en.js so the studio never ships a page's worth
   of marketing and FAQ text it cannot display. The engine's register()
   replaces a language's dictionary wholesale, so this file re-registers the
   main dictionary with the `site` namespace merged on top. Load order:
   i18n.js → dictionary-ko.js → dictionary-en.js → the Korean site dictionary → this file. */
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
        landingTitle: "Invitation Studio · Small invitations, lasting moments",
        landingDescription: "Free mobile invitations with no sign-up: pick a design, fill it in, send it as a file or a link.",
        guideTitle: "How it works · Invitation Studio",
        guideDescription: "Choosing a design, filling it in, the three ways to finish, and where your data lives — on one page.",
        privacyTitle: "Privacy Policy · Invitation Studio",
        privacyDescription: "What stays in your browser, what is stored on the server, when a public link expires, and how analytics and error diagnostics are handled.",
        termsTitle: "Terms of Service · Invitation Studio",
        termsDescription: "The conditions for using this no-sign-up invitation maker, your responsibility for what you publish, and how long a public link lives."
      },
      header: { tagline: "Make the small days special.", guide: "How it works", cta: "Make an invitation", skip: "Skip to content", langLabel: "Language", langDescription: "Display language", navLabel: "Site" },
      footer: { brand: "INVITATION STUDIO", about: "About", guide: "How it works", data: "Your data", privacy: "Privacy", terms: "Terms", note: "Small invitations, lasting moments.", navLabel: "Footer links" },
      landing: {
        hero: {
          eyebrow: "No sign-up · Free",
          title: "Small invitations, lasting moments.",
          lead: "Pick a design, fill it in, send it as a file or a link.",
          cta: "Make an invitation",
          sample: "See a finished invitation first",
          imageAlt: "A finished invitation open on a phone screen"
        },
        steps: {
          eyebrow: "HOW IT WORKS",
          title: "Three steps",
          one: { title: "Pick a design", text: "Birthdays, weddings, first birthdays, get-togethers. Choose a design for the occasion and see a sample right away." },
          two: { title: "Fill it in", text: "Add the title, date, place, and a message, then photos if you like. The preview is exactly what your guests get." },
          three: { title: "Keep · File · Link", text: "Keep it in this browser, download a single file, or share a public link." }
        },
        gallery: {
          eyebrow: "DESIGNS",
          title: "Designs",
          lead: "Choose by taste. Every occasion has several designs.",
          cta: "See all designs",
          stripLabel: "Design list",
          bloomPortrait: "Birthday",
          wedding: "Wedding",
          firstChapter: "First birthday",
          goldenYears: "60th birthday",
          botanical: "Date",
          midnightCinema: "Event"
        },
        designs: {
          alt: {
            bloomPortrait: "Sample invitation design · Birthday",
            wedding: "Sample invitation design · Wedding",
            firstChapter: "Sample invitation design · First birthday",
            goldenYears: "Sample invitation design · 60th birthday",
            botanical: "Sample invitation design · Date",
            midnightCinema: "Sample invitation design · Event"
          }
        },
        trust: {
          eyebrow: "PEACE OF MIND",
          title: "Use it with confidence",
          one: { title: "No account, no app", text: "Open it in a browser and start. We never ask for an email or a phone number." },
          two: { title: "Drafts stay in your browser", text: "Your work is saved as you go, but it is never sent to a server." },
          three: { title: "Files are yours forever, links are yours to end", text: "A downloaded file stays with you. A public link expires on its own and can be revoked whenever you want." },
          link: "Where is my data stored?"
        },
        closing: { eyebrow: "READY?", title: "Make one now", cta: "Make an invitation" }
      },
      guide: {
        title: "How it works",
        lead: "Pick a design, fill it in, and send it the way you prefer.",
        toc: { steps: "Three steps", finish: "Three ways to finish", data: "Where your data lives", faq: "Questions" },
        steps: {
          eyebrow: "STEP BY STEP",
          title: "Three steps",
          one: { title: "Design", text: "Choose the occasion first, then tap a design card to see the sample at full size. Press 'Use this design' when it feels right. You can change the design later without losing anything you have written.", alt: "The studio's design picker" },
          two: { title: "Content", text: "Start with the basics: title, date, and message. The place and map link come next, and photos and effects are in collapsed sections. The preview on the right is exactly the document your guests receive.", alt: "The studio's content editor" },
          three: { title: "Finish", text: "Choose one of three ways to finish. Your draft is saved to this browser as you write, so you can close the tab before this step and pick up later.", alt: "The studio's finish screen" }
        },
        finish: {
          eyebrow: "FINISHING",
          title: "Three ways to finish",
          lead: "Any of them works, and you can use more than one. The difference is where the invitation ends up.",
          tableLabel: "Comparison of the three ways to finish",
          head: { method: "Method", where: "Where it lives", switch: "If you change browsers", undo: "Undo" },
          library: { method: "Save to library", where: "This browser", switch: "Gone", undo: "Delete from the list" },
          file: { method: "Save as a file", where: "An HTML file on your device", switch: "The file stays", undo: "Delete the file" },
          link: { method: "Share a link", where: "Our server", switch: "The link stays alive; only this browser can revoke it", undo: "Revoke in the studio" },
          fileTitle: "What do I do with the HTML file?",
          fileText: "It is one file with the photos inside, so it opens in any browser. Attach it in a messenger or an email, or import it back into the library later to edit it."
        },
        data: {
          eyebrow: "YOUR DATA",
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
          eyebrow: "QUESTIONS",
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
        closing: { eyebrow: "READY?", title: "Ready to make one?", cta: "Make an invitation" }
      },
      /* The two legal pages. Full drafts naming the real operator, `오재성`
         (kept in Korean here too, not romanized), and the real contact
         address, `rojae@kakao.com`. The retention numbers repeat the shipped
         defaults from docs/publishing.md and are checked against
         server/config/publishing.cjs by tests/site-pages.test.js. */
      privacy: {
        title: "Privacy Policy",
        lead: "There is no sign-up here. We never ask for your name or your email. Even so, you should know exactly where your data goes while you make an invitation and send it.",
        updated: "Last updated: 18 September 2026",
        toc: {
          browser: "In this browser",
          server: "On the server",
          retention: "How long a link lasts",
          analytics: "Analytics",
          diagnostics: "Error diagnostics",
          deletion: "Deletion requests",
          children: "Children's data",
          contact: "Contact"
        },
        browser: {
          eyebrow: "01",
          title: "In this browser",
          lead: "The items below live only in this browser's storage: none of them is ever sent to a server, and none shows up on your other devices. The one stored value that does leave this browser is the analytics identifier described under Analytics, and only after you accept.",
          one: "The draft you are working on. It is saved as you write.",
          two: "Invitations you saved to the library. Title, date, place, message and photos are all held in this browser.",
          three: "The management token that revokes a public link. It is stored only in the browser that published the link and never appears in the link itself.",
          four: "Your display language and the analytics choice you made on this site.",
          note: "Clearing this browser's storage erases all of the above. A public link you already published stays alive, but the only way to revoke it disappears with the storage."
        },
        server: {
          eyebrow: "02",
          title: "On the server",
          lead: "One copy of an invitation is stored on our server only when you press Share a link. What is stored is what you wrote into that invitation.",
          one: "The title and the message",
          two: "The names you wrote into the invitation",
          three: "The date and time",
          four: "The place name, the address and the map link",
          five: "Phone numbers or links you put in contact items",
          six: "The photos you added. They are stored inside the document as data URIs, not as separate files.",
          note: "Anyone who has the link can read the invitation. It is not indexed by search engines, but it is not password protected either. Only write what every guest may see."
        },
        retention: {
          eyebrow: "03",
          title: "How long a link lasts",
          lead: "A public link expires on a sliding window: opening it pushes the expiry forward.",
          one: "Publishing sets the link to expire 7 days later.",
          two: "When the link is opened, the expiry moves to 7 days from then. That refresh is throttled to at most once every 6 hours, so a burst of visits counts as one.",
          three: "However often it is opened, it never lives longer than 30 days from the day it was published. An invitation that carries a date stays open until 7 days after that date, because an invitation is sent before the day it is for and the link must not close first. A date more than 400 days after publishing does not extend anything.",
          note: "The 7 days, 30 days, and the week after the event are today's operating defaults and the operator can change them. An expired link no longer opens."
        },
        analytics: {
          eyebrow: "04",
          title: "Analytics",
          lead: "Analytics tools are loaded only after you accept them. If you choose Essential only in the banner on your first visit, no analytics script runs at all.",
          one: "The tools are Google Analytics 4, PostHog and Vercel Web Analytics.",
          two: "Only a fixed list of values is sent: which screen you looked at, which design you chose, whether you saved or downloaded.",
          three: "The title, names, contacts, photos and places you wrote into an invitation are never sent. Neither is a public link's address or its management token.",
          four: "If your browser sends Do Not Track or Global Privacy Control, analytics stay off whatever you chose here.",
          five: "A per-visit identifier called flow_id is created and kept in this browser's storage so separate events can be read as one visit. It is a random value tied to no name and no account, it is sent only with product events and only after you accept, and Google Analytics 4 and PostHog set cookies or storage of their own once they load.",
          settings: "Reopen cookie & analytics settings"
        },
        diagnostics: {
          eyebrow: "05",
          title: "Error diagnostics",
          lead: "Diagnostic reports about a broken screen are sent whatever you chose, because they are the minimum we need to keep the service working.",
          one: "A report carries a fixed error category, the script file and line where it happened, and the browser and operating system family.",
          two: "The raw error message, the page address and any invitation content are never sent. At most eight reports are recorded per page."
        },
        deletion: {
          eyebrow: "06",
          title: "Deletion requests",
          lead: "A public link is the only thing we hold, so deleting it is simple.",
          one: "Open the studio in the browser that published the link and revoke it. The server copy is deleted straight away.",
          two: "If that browser is gone, or you received the invitation rather than made it, email rojae@kakao.com with the link address and we will delete it after checking.",
          three: "An HTML file or a screenshot someone already saved cannot be recalled.",
          note: "We cannot delete drafts or library entries for you: they never left your browser. Remove them from the library list yourself."
        },
        children: {
          eyebrow: "07",
          title: "Children's data",
          lead: "This service is not directed at children, and we neither ask for nor collect the age of the person making an invitation.",
          one: "When a child's name or photo goes into an invitation — a first birthday or a kindergarten party — the adult making the invitation decides whether to publish it.",
          two: "To have a link containing a child's details removed, follow the deletion steps above."
        },
        contact: {
          eyebrow: "08",
          title: "Contact",
          lead: "This service is operated by 오재성. Send privacy questions and deletion requests to rojae@kakao.com.",
          note: "If this policy changes, the date at the top of this page changes with it."
        }
      },
      terms: {
        title: "Terms of Service",
        lead: "Kept short. Using this service means you agree to what follows.",
        updated: "Last updated: 18 September 2026",
        toc: {
          service: "What this is",
          account: "There is no account",
          content: "Your content, your responsibility",
          prohibited: "What you may not publish",
          availability: "Availability and warranty",
          expiry: "How long a public link lives",
          contact: "Contact and changes"
        },
        service: {
          eyebrow: "01",
          title: "What this is",
          lead: "A free tool for making a mobile invitation in your browser and sending it as a file or as a public link.",
          one: "The invitation is built inside your browser. Saving it to the library or downloading it as an HTML file involves no server at all.",
          two: "Only when you press Share a link is a copy stored on our server and given a public address."
        },
        account: {
          eyebrow: "02",
          title: "There is no account",
          lead: "No sign-up, no login. That convenience comes with a hard limit.",
          one: "This browser is your identity. Clear its storage and there is no way to recover your drafts, your library, or the right to revoke a link.",
          two: "There is no account recovery, so download an HTML file of anything you want to keep."
        },
        content: {
          eyebrow: "03",
          title: "Your content, your responsibility",
          lead: "What goes into an invitation is yours, and so is the responsibility for it.",
          one: "To put another person's name, photo or phone number into an invitation and publish it, you must have the right to share it. Ask the people in the photos and the owners of the contacts first.",
          two: "Anyone with the address can open a public link. There is no password, so publish only what may be public.",
          three: "Check that you may use the photos, fonts and artwork you add.",
          four: "We do not review what is published in advance. We may take a link down after a report."
        },
        prohibited: {
          eyebrow: "04",
          title: "What you may not publish",
          lead: "The following may not be published. We take such links down without notice when we find them.",
          one: "Other people's personal details published without their consent",
          two: "Anything illegal, or hateful, harassing or threatening",
          three: "Sexual content, and any material exploiting children",
          four: "Links used for fraud, phishing or malware",
          five: "Anything infringing someone else's copyright or trade mark",
          six: "Anything that disrupts the service, such as automated bulk publishing"
        },
        availability: {
          eyebrow: "05",
          title: "Availability and warranty",
          lead: "This service is free and provided as it is.",
          one: "It can stop at any time for maintenance or a fault, and features may change or disappear.",
          two: "Publishing has operational limits. Once a limit is reached, no new link can be created.",
          three: "To the extent the law allows, we are not liable for loss caused by data disappearing or a link failing to open. Download an HTML file of anything that matters."
        },
        expiry: {
          eyebrow: "06",
          title: "How long a public link lives",
          lead: "A public link is not permanent storage.",
          one: "It expires 7 days after it was last opened. Opening it pushes that forward, at most once every 6 hours.",
          two: "However often it is opened, it expires 30 days after publishing. An invitation that carries a date stays open until 7 days after that date.",
          three: "The 7 days, 30 days, and the week after the event are today's operating defaults and the operator can change them. An expired or revoked link cannot be restored; open the invitation again and publish a new one."
        },
        contact: {
          eyebrow: "07",
          title: "Contact and changes",
          lead: "This service is operated by 오재성. Send questions, reports and deletion requests to rojae@kakao.com.",
          note: "If these terms change, the date at the top of this page changes with them. Continuing to use the service after a change means you accept it."
        }
      }
    }
  };
});
