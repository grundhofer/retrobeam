// SPDX-FileCopyrightText: 2026 Sebastian Grundhöfer
// SPDX-License-Identifier: AGPL-3.0-or-later

import i18n from "i18next";
import { initReactI18next } from "react-i18next";

const LANG_KEY = "retrobeam.lang";

const resources = {
  en: {
    translation: {
      app: {
        name: "RetroBeam",
        tagline: "Retros your team will look forward to.",
      },
      home: {
        title: "Create a retro board",
        boardName: "Board name",
        boardNamePlaceholder: "Sprint 42 retro",
        template: "Template",
        layout: "Layout",
        layoutMode: { columns: "Columns", canvas: "Canvas" },
        layoutHint: {
          columns: "Classic lists — one column per topic.",
          canvas: "A freeform board — place notes anywhere in each zone.",
        },
        create: "Create board",
        creating: "Creating…",
        createFailed: "Creating the board failed. Please try again.",
      },
      template: {
        "went-well": {
          name: "Classic — Went well / To improve / Actions",
          hint: "The universal default. Right for almost every sprint retro.",
        },
        "start-stop-continue": {
          name: "Start / Stop / Continue",
          hint: "Action-oriented and self-explanatory — great for new teams.",
        },
        "mad-sad-glad": {
          name: "Mad / Sad / Glad",
          hint: "Emotional check — good after a stressful sprint.",
        },
        "four-ls": {
          name: "4Ls — Liked / Learned / Lacked / Longed for",
          hint: "Rounded review with a learning focus, ideal at milestones.",
        },
        sailboat: {
          name: "Sailboat — Wind / Anchors / Rocks / Island",
          hint: "Visual metaphor for drivers, blockers, risks and goals.",
        },
        starfish: {
          name: "Starfish — Keep / Less / More / Stop / Start",
          hint: "Finer-grained dial-up/dial-down for experienced teams.",
        },
      },
      join: {
        title: "Join “{{board}}”",
        yourName: "Your name",
        submit: "Join",
      },
      lobby: {
        hint_one:
          "{{count}} person is here. Share the link — start the retro when everyone arrived.",
        hint_other:
          "{{count}} people are here. Share the link — start the retro when everyone arrived.",
      },
      board: {
        share: "Share link",
        copy: "Copy",
        copied: "Copied!",
        participants: "Who's here",
        facilitator: "Facilitator",
        you: "you",
        offline: "offline",
      },
      phase: {
        stepper: "Retro phases",
        lobby: "Lobby",
        checkin: "Check-in",
        write: "Write",
        present: "Present",
        vote: "Vote",
        discuss: "Discuss",
        close: "Close",
        done: "Done",
        next: "Next",
        startRetro: "Start retro",
      },
      phasePlan: {
        title: "Plan this retro",
        adminHint: "Choose the optional phases before you start.",
        memberHint: "This is the planned agenda for the retro.",
        locked: "The agenda is locked because this retro has already started.",
        required: "Required",
        phase: {
          checkin: {
            title: "Check-in",
            description: "Warm up with a question and working agreements.",
          },
          write: {
            title: "Write",
            description: "Collect the team's observations privately.",
          },
          present: {
            title: "Present",
            description: "Share the cards one person at a time.",
          },
          vote: {
            title: "Vote",
            description: "Prioritize cards with dot voting.",
          },
          discuss: {
            title: "Discuss & actions",
            description: "Discuss cards and capture action items.",
          },
          close: {
            title: "Closing with kudos & ROTI",
            description: "End with appreciation and a short rating.",
          },
        },
      },
      ready: {
        imDone: "I'm done",
        done: "Done",
        count: "{{ready}}/{{total}} done",
      },
      timer: {
        pause: "Pause",
        resume: "Resume",
        stop: "Stop",
        paused: "paused",
        sound: "Timer sound",
      },
      note: {
        placeholder: "Write a note… (Enter to add)",
        add: "Add",
        edit: "Edit note",
        delete: "Delete note",
        save: "Save",
        cancel: "Cancel",
        ghostWriting: "{{name}} is writing…",
        notPresented: "Not presented yet",
      },
      column: {
        addColumn: "Add column",
        add: "Add",
        namePlaceholder: "Column name",
        rename: "Rename column",
        delete: "Delete column",
        reallyDelete: "Really delete?",
        hide: "Hide from team",
        reveal: "Reveal to team",
        hidden: "hidden",
      },
      picker: {
        spin: "Spin the wheel",
        startSlots: "Start slots",
        chooseCard: "Choose a face-down card",
        chooseCardAria: "Choose card {{index}}",
        chooseCardHint: "Choose the next person's card in the sidebar",
        next: "Next person",
        finishRound: "Finish the round",
        presenting: "{{name}} is presenting",
        skip: "Skip",
        winner: "{{name}} is up!",
        everyone: "Everyone presented! 🎉",
        exclude: "Take {{name}} off the wheel",
        current: "presenting",
        pick: "Choose",
        pickAria: "Choose {{name}} to present",
      },
      rail: {
        online: "{{count}} online",
        teamCards_one: "{{count}} card from the team",
        teamCards_other: "{{count}} cards from the team",
        youPresenting: "You're up",
        donePresenting: "Done presenting",
        waiting: "The facilitator is leading the round",
      },
      canvas: {
        hint: "Double-click to add a note",
        occupied: "Occupied by another note",
        zoomIn: "Zoom in",
        zoomOut: "Zoom out",
        fit: "Fit to screen",
        resize: "Resize zone",
      },
      present: {
        focus: {
          heading: "{{name}} is presenting",
          count_one: "{{count}} card",
          count_other: "{{count}} cards",
          empty: "No cards in this zone.",
        },
        spotlight: "{{name}} is presenting this card",
        walkthrough: {
          nextCard: "Next card",
          position: "Card {{index}} of {{total}}",
        },
        scoped: {
          hint: "You'll see each person's cards as they present.",
          facilitator: "Only you can see the cards nobody has presented yet.",
        },
      },
      focus: {
        label: "Focus mode",
        on: "One card at a time",
        off: "Show every card",
      },
      group: {
        ungroup: "Unstack note",
      },
      vote: {
        yourVotes: "Your votes",
        remaining_one: "{{count}} vote left",
        remaining_other: "{{count}} votes left",
        meter: "{{done}}/{{total}} finished voting",
        settings: "Voting",
        votesPerPerson: "Votes per person",
        maxPerTarget: "Max per card",
        topN: "Top cards",
        apply: "Apply",
        plus: "Add a vote",
        minus: "Remove a vote",
        yours_one: "Your vote: {{count}}",
        yours_other: "Your votes: {{count}}",
        voterMulti: "{{name}} ×{{count}}",
        voterLabel_one: "{{name}} gave {{count}} vote",
        voterLabel_other: "{{name}} gave {{count}} votes",
        namesShown: "Names are shown with the result.",
        namesBlind: "Blind vote — no names are shown.",
      },
      discuss: {
        queue: "Discussion",
        focusCard: "Discuss this card",
        clearFocus: "Show all cards",
      },
      action: {
        title: "Action items",
        placeholder: "What are we going to do?",
        add: "Add",
        unassigned: "Unassigned",
        toggle: "Mark as done",
        delete: "Delete action",
        empty: "No action items yet — capture decisions while you discuss.",
      },
      kudos: {
        title: "Appreciation",
        subtitle: "End on positives — send a teammate some love.",
        empty: "No kudos yet. Be the first to appreciate someone!",
        to: "To",
        placeholder: "Say why (optional)…",
        send: "Send kudos",
        from: "— {{name}}",
        anonymous: "— anonymous",
        anonymousSend: "Send anonymously",
        someone: "someone",
        everyone: "Everyone",
        remove: "Remove kudo",
        card: {
          "thank-you": "Thank you",
          "great-job": "Great job",
          "well-done": "Well done",
          congratulations: "Congratulations",
          "totally-awesome": "Totally awesome",
        },
      },
      gif: {
        add: "GIF",
        search: "Search GIFs…",
        loading: "Searching…",
        none: "No GIFs found.",
        hint: "Type to search for a GIF.",
        unavailable: "GIF search isn't set up for this board.",
        failed: "GIF search didn't respond. Try again in a moment.",
        throttled: "That's a lot of GIF searching! Give it a few seconds.",
        quota:
          "We've hit this hour's GIF search limit. It comes back within the hour — the rest of the retro is unaffected.",
        remove: "Remove GIF",
        poweredBy: "Powered by KLIPY",
      },
      menu: {
        export: "Export",
        exportScope: "Scope",
        scope: {
          all: "Everything",
          summary: "Summary",
        },
        includeAuthors: "Include author names",
        rendering: "Rendering…",
        imageFailed: "The image could not be created. Try a smaller scope.",
        settings: "Board settings",
        gifsEnabled: "Allow GIFs",
        cursorsEnabled: "Live cursors (1 update/s)",
        voterNamesEnabled: "Show who voted (after the reveal)",
        voterNamesLocked: "Locked once voting has started.",
        voterNamesAnonymous: "Not available on an anonymous board.",
        layout: "Board layout",
        layoutMode: {
          columns: "Columns",
          canvas: "Canvas",
        },
        pickerStyle: "Picker style",
        picker: {
          wheel: "Wheel",
          slots: "Slots",
          cards: "Cards",
        },
        duplicate: "Duplicate board",
        duplicateName: "Copy of {{name}}",
        retentionNotice: "Auto-deletes on {{date}}",
        retentionKept: "This board is kept (no auto-delete).",
        keep: "Keep",
        deleteNow: "Delete now",
        reallyDelete: "Really delete?",
      },
      roster: {
        makeFacilitator: "Make facilitator",
        removeFacilitator: "Remove facilitator",
        you: "(you)",
      },
      done: {
        title: "Retro finished",
        body: "This board is archived and read-only.",
      },
      deleted: {
        title: "Board deleted",
        body: "This retro board has been deleted.",
      },
      checkin: {
        icebreaker: "Check-in",
        noQuestion: "Warming up…",
        shuffle: "New question",
        primeDirectiveTitle: "The Prime Directive",
        primeDirective:
          "Regardless of what we discover, we understand and truly believe that everyone did the best job they could, given what they knew at the time, their skills and abilities, the resources available, and the situation at hand.",
        agreements: "Working agreements",
        agreementsDefault:
          "• Vegas rule — what's said here stays here\n• Attack problems, not people\n• One conversation at a time\n• Everyone's voice matters",
        edit: "Edit",
      },
      roti: {
        title: "Return on time invested",
        question: "Was this retro a good use of your time?",
        result: "Average {{average}} · {{count}} responses",
        pending_one:
          "{{count}} response so far · the average is shared when the retro closes",
        pending_other:
          "{{count}} responses so far · the average is shared when the retro closes",
        tooFew: "Too few responses to share an average anonymously.",
        anonymous: "Anonymous — only the average is shared, once at the end.",
      },
      icebreaker: {
        "one-word": "In one word, how did this sprint feel?",
        weather:
          "What's your weather report for this sprint? (sunny, stormy, foggy…)",
        "sprint-emoji": "Which emoji sums up your sprint?",
        "energy-level": "What's your energy level right now, 1 to 10?",
        highlight: "What was your highlight of the sprint?",
        learned: "What's one thing you learned recently?",
        superpower: "If you had one superpower this sprint, what would it be?",
        "movie-title": "If this sprint were a movie, what's its title?",
        song: "What song describes your week?",
        animal: "What animal matches your mood today?",
        "gif-week": "What GIF sums up your week?",
        grateful: "What are you grateful for this sprint?",
        surprise: "What surprised you this sprint?",
        "coffee-count": "How many coffees did this sprint take?",
        weekend: "What are you looking forward to this weekend?",
        "hidden-talent": "Share a hidden talent nobody here knows about.",
        "if-color": "What color is your mood today?",
        "proud-of": "What are you proud of from this sprint?",
        recharge: "How do you recharge after a tough sprint?",
        "one-wish": "One wish for the next sprint?",
        "team-word": "One word to describe the team this sprint?",
        "looking-forward": "What are you looking forward to next sprint?",
        "waffle-or-pancake": "Waffles or pancakes — and why does it matter?",
        "desert-island": "One tool you'd bring to a desert island?",
      },
      status: {
        connecting: "Connecting…",
        offline: "Connection lost — reconnecting…",
      },
      notFound: {
        title: "Board not found",
        body: "This board does not exist or has been deleted.",
        home: "Create a new board",
      },
      lookupFailed: {
        title: "Couldn't reach the board",
        body: "The board may be fine — we just couldn't ask. Check your connection and try again.",
        retry: "Try again",
      },
      reject: {
        title: "That didn't go through",
        PHASE_LOCKED: "That isn't available in this phase.",
        NOT_ADMIN: "Only the facilitator can do that.",
        NOT_AUTHOR: "You can only change your own cards.",
        NOT_FOUND: "That card is no longer there.",
        CONFLICT: "Someone changed that at the same moment. Try again.",
        INVALID: "That didn't work — the board has been refreshed.",
        VOTE_BUDGET: "You've used all your votes.",
        RATE_LIMIT: "Too many actions at once. Give it a second.",
        CURSOR_BUDGET:
          "Live cursors are paused for today to protect the free-tier budget. Everything else keeps working.",
        dismiss: "Dismiss",
      },
      update: {
        available: "A newer version of RetroBeam is running on the server.",
        reload: "Reload",
      },
      error: {
        title: "Something went wrong",
        body: "The board itself is safe — it lives on the server. Reloading rejoins it.",
        reload: "Reload the board",
      },
      site: {
        nav: "Site",
      },
      landing: {
        kicker: "Retrospectives for teams",
        lede: "Guided retrospectives in the browser — one person facilitates, everyone writes in private first, and a wheel decides who presents. Free, no ads.",
        cta: "Create a retro board",
        ctaHint: "Just enter a board name · no account required",
        trust: "Boards stored in the EU · Open source",
        howTitle: "How a retro runs",
        steps: {
          share: {
            title: "Share a link.",
            text: "Create a board, drop the link in your team chat, type a name — you're in.",
          },
          write: {
            title: "Write in private, then present.",
            text: "Nobody sees anyone else's notes until the wheel calls that person up.",
          },
          decide: {
            title: "Vote, discuss, say thanks.",
            text: "Vote blind, discuss the top cards, capture action items as you go — and end on kudos.",
          },
        },
        preview: {
          label: "Example: a board during the write phase",
          boardName: "Sprint 42",
          note1: "Pairing on Thursday found the bug in twenty minutes.",
          note2: "The review queue is too long again.",
          note3: "Daily review slot at 11:00",
          author1: "Mira",
          author2: "Mira",
          author3: "Mira",
        },
        whyTitle: "Why RetroBeam",
        why: {
          private: {
            title: "Private means private.",
            text: "Other people's notes don't leave the server until it's their turn — not just hidden in the browser.",
          },
          nothing: {
            title: "Nothing to manage.",
            text: "No accounts, no tracking, no seat licences; by default, boards delete themselves after 90 days.",
          },
          guided: {
            title: "Guided, and still fun.",
            text: "A phase stepper walks the room through the retro; the wheel and the confetti do the moments.",
          },
          languages: {
            title: "German and English.",
            text: "Switchable mid-retro; boards are stored in EU data centres.",
          },
        },
        faqTitle: "Questions",
        faqGroups: {
          basics: "Getting started",
          privacy: "Privacy and visibility",
          openSource: "Teams and open source",
        },
        faq: {
          cost: {
            q: "What does it cost — and where's the catch?",
            a: "Nothing: no paid plans, no ads, no board caps. The catch: RetroBeam runs on Cloudflare's free tier, which has a daily budget for the whole instance. If an unusual number of teams run retros on the same day it can run dry — it resets at midnight UTC, and if you can't risk that, self-host.",
          },
          account: {
            q: "Do I need an account, or install anything?",
            a: "No. Open the link, type a name, you're in — no accounts, no e-mail, no extension. It runs in current browsers; it's tested with Chromium, Firefox and WebKit.",
          },
          where: {
            q: "Where does the data live?",
            a: "Each board lives in its own Cloudflare Durable Object, pinned to the EU when it's created: persistent board storage and the BoardRoom logic stay in EU data centres. To be plain about it: Cloudflare is a US company, and your connection and some request handling run through the nearest Cloudflare edge, which can be outside the EU. The privacy notice lists the sub-processors.",
          },
          howLong: {
            q: "How long is it kept?",
            a: "90 days from creation, then the board deletes itself. The facilitator can delete it right away at any time — or deliberately keep it, and then no clock runs. Our suggestion: export at the end, then delete; exports leave names out by default.",
          },
          whoReads: {
            q: "Who can read my notes, and when?",
            a: "During the write phase, nobody — the facilitator included: the server never sends other people's notes to your browser. During the presenting round the room gets a person's cards from visible columns when the wheel calls them up. After that everyone with the link sees the shared board; columns the facilitator keeps hidden remain facilitator-only. The link is the only key, so only hand it to your team.",
          },
          facilitator: {
            q: "Does the facilitator see more than the team?",
            a: "Not in the write phase. In the presenting round, yes: the facilitator sees the whole board from the start, names included, because they run the round and need to see what's still to come. Once everyone has presented, everyone sees the same visible columns; any columns the facilitator keeps hidden remain facilitator-only.",
          },
          hideAuthors: {
            q: "Can I hide who wrote which card?",
            a: "Not yet. Kudos and the closing ROTI poll can be anonymous, and while voting is open nobody sees who voted for what — but the names on cards can't currently be switched off. Don't plan around it until it ships.",
          },
          gifs: {
            q: "What about the GIFs?",
            a: "GIF search goes through KLIPY, a US provider; search terms pass through our server, so KLIPY sees neither your IP address nor who's searching. The images themselves, though, load in your browser straight from KLIPY's CDN — and that CDN does see your IP address. To avoid that, ask the facilitator to switch GIFs off before anyone adds one. This prevents searches and new GIFs; GIFs already on the board keep loading from KLIPY until they are removed.",
          },
          selfHost: {
            q: "Can I self-host it?",
            a: "Yes. It's one Cloudflare Worker plus one Durable Object per board, with no separate database service to run, and it works on their free tier for you too; the README on GitHub has the steps. GIF search needs your own KLIPY key — without one it's simply off.",
          },
          license: {
            q: "What's the licence?",
            a: "AGPL-3.0-or-later. You may use, change and pass on RetroBeam; if you run a modified version for other people over a network, you have to offer those people the source. The source of the exact version running here is linked in the footer.",
          },
          commercial: {
            q: "Is this a commercial service?",
            a: "No. RetroBeam is one person's private project — no company behind it, no paid plans, no ads, and no data is sold. The infrastructure uses Cloudflare's free tier; I pay the remaining costs, such as the domain, myself.",
          },
          work: {
            q: "Can I use this at work — and what about the works council?",
            a: "Technically and licence-wise, yes; whether your company signs off is your company's call. In Germany a tool with live presence and per-person notes falls under co-determination (§ 87 (1) no. 6 BetrVG) — so talk to the works council before, not after; the data inventory, the sub-processors and the facilitator caveat are written up for exactly that in docs/05 in the repository. To be honest: retrobeam.de comes with no contract, no guarantees and no data-processing agreement — if you need those, self-host.",
          },
        },
        noticeTitle: "Not a commercial service",
        notice:
          "RetroBeam is a personal project by Sebastian Grundhöfer, not a company. Running retrobeam.de is free of charge, with no ads, no tracking and no sale of data; I pay for it myself. The source is free software under the AGPL-3.0 — anyone may run their own instance.",
      },
      legal: {
        license: "Free software: AGPL-3.0-or-later",
        redistribute: "Redistribution and modification permitted, no warranty.",
        source: "Source code",
        sourceVersion: "Source code of the version running here",
        privacy: "Privacy",
        privacyTitle: "Privacy notice",
        imprint: "Imprint",
        imprintTitle: "Imprint",
        updated: "Last updated:",
      },
    },
  },
  de: {
    translation: {
      app: {
        name: "RetroBeam",
        tagline: "Retros, auf die sich dein Team freut.",
      },
      home: {
        title: "Retro-Board erstellen",
        boardName: "Name des Boards",
        boardNamePlaceholder: "Sprint-42-Retro",
        template: "Vorlage",
        layout: "Layout",
        layoutMode: { columns: "Spalten", canvas: "Canvas" },
        layoutHint: {
          columns: "Klassische Listen — eine Spalte pro Thema.",
          canvas: "Ein freies Board — Notizen frei in jeder Zone platzieren.",
        },
        create: "Board erstellen",
        creating: "Wird erstellt…",
        createFailed:
          "Das Board konnte nicht erstellt werden. Bitte versuch es erneut.",
      },
      template: {
        "went-well": {
          name: "Klassisch — Lief gut / Zu verbessern / Maßnahmen",
          hint: "Der universelle Standard. Passt für fast jede Sprint-Retro.",
        },
        "start-stop-continue": {
          name: "Anfangen / Aufhören / Weitermachen",
          hint: "Handlungsorientiert und selbsterklärend — super für neue Teams.",
        },
        "mad-sad-glad": {
          name: "Wütend / Traurig / Froh",
          hint: "Emotionaler Check — gut nach einem stressigen Sprint.",
        },
        "four-ls": {
          name: "4Ls — Gefallen / Gelernt / Gefehlt / Gewünscht",
          hint: "Ausgewogener Rückblick mit Lernfokus, ideal bei Meilensteinen.",
        },
        sailboat: {
          name: "Segelboot — Wind / Anker / Felsen / Insel",
          hint: "Visuelle Metapher für Antrieb, Bremsen, Risiken und Ziele.",
        },
        starfish: {
          name: "Seestern — Beibehalten / Weniger / Mehr / Aufhören / Anfangen",
          hint: "Feinere Justierung für erfahrene Teams.",
        },
      },
      join: {
        title: "„{{board}}“ beitreten",
        yourName: "Dein Name",
        submit: "Beitreten",
      },
      lobby: {
        hint_one:
          "{{count}} Person ist da. Teile den Link — starte die Retro, wenn alle da sind.",
        hint_other:
          "{{count}} Personen sind da. Teile den Link — starte die Retro, wenn alle da sind.",
      },
      board: {
        share: "Link teilen",
        copy: "Kopieren",
        copied: "Kopiert!",
        participants: "Wer ist da",
        facilitator: "Moderation",
        you: "du",
        offline: "offline",
      },
      phase: {
        stepper: "Retro-Phasen",
        lobby: "Lobby",
        checkin: "Check-in",
        write: "Schreiben",
        present: "Vorstellen",
        vote: "Abstimmen",
        discuss: "Diskutieren",
        close: "Abschluss",
        done: "Fertig",
        next: "Weiter",
        startRetro: "Retro starten",
      },
      phasePlan: {
        title: "Ablauf festlegen",
        adminHint: "Wähle vor dem Start die optionalen Phasen aus.",
        memberHint: "Das ist der geplante Ablauf dieser Retro.",
        locked:
          "Der Ablauf ist gesperrt, da diese Retro bereits gestartet wurde.",
        required: "Pflichtphase",
        phase: {
          checkin: {
            title: "Check-in",
            description: "Mit einer Frage und Arbeitsvereinbarungen ankommen.",
          },
          write: {
            title: "Schreiben",
            description: "Beobachtungen zunächst privat sammeln.",
          },
          present: {
            title: "Vorstellen",
            description: "Die Karten nacheinander im Team teilen.",
          },
          vote: {
            title: "Abstimmen",
            description: "Karten mit Punkten priorisieren.",
          },
          discuss: {
            title: "Diskutieren & Maßnahmen",
            description: "Karten besprechen und Maßnahmen festhalten.",
          },
          close: {
            title: "Abschluss mit Kudos & ROTI",
            description: "Mit Wertschätzung und kurzer Bewertung abschließen.",
          },
        },
      },
      ready: {
        imDone: "Ich bin fertig",
        done: "Fertig",
        count: "{{ready}}/{{total}} fertig",
      },
      timer: {
        pause: "Pause",
        resume: "Weiter",
        stop: "Stopp",
        paused: "pausiert",
        sound: "Timer-Ton",
      },
      note: {
        placeholder: "Notiz schreiben… (Enter zum Hinzufügen)",
        add: "Hinzufügen",
        edit: "Notiz bearbeiten",
        delete: "Notiz löschen",
        save: "Speichern",
        cancel: "Abbrechen",
        ghostWriting: "{{name}} schreibt…",
        notPresented: "Noch nicht vorgestellt",
      },
      column: {
        addColumn: "Spalte hinzufügen",
        add: "Hinzufügen",
        namePlaceholder: "Name der Spalte",
        rename: "Spalte umbenennen",
        delete: "Spalte löschen",
        reallyDelete: "Wirklich löschen?",
        hide: "Vor dem Team verbergen",
        reveal: "Für das Team freigeben",
        hidden: "verborgen",
      },
      picker: {
        spin: "Rad drehen",
        startSlots: "Slots starten",
        chooseCard: "Verdeckte Karte wählen",
        chooseCardAria: "Karte {{index}} wählen",
        chooseCardHint: "Wähle rechts die Karte der nächsten Person",
        next: "Nächste Person",
        finishRound: "Runde abschließen",
        presenting: "{{name}} präsentiert",
        skip: "Überspringen",
        winner: "{{name}} ist dran!",
        everyone: "Alle haben präsentiert! 🎉",
        exclude: "{{name}} vom Rad nehmen",
        current: "dran",
        pick: "Auswählen",
        pickAria: "{{name}} auswählen",
      },
      rail: {
        online: "{{count}} online",
        teamCards_one: "{{count}} Karte vom Team",
        teamCards_other: "{{count}} Karten vom Team",
        youPresenting: "Du bist dran",
        donePresenting: "Fertig mit Vorstellen",
        waiting: "Die Moderation führt durch die Runde",
      },
      canvas: {
        hint: "Doppelklick zum Hinzufügen",
        occupied: "Durch eine andere Notiz belegt",
        zoomIn: "Vergrößern",
        zoomOut: "Verkleinern",
        fit: "An Fenster anpassen",
        resize: "Zone skalieren",
      },
      present: {
        focus: {
          heading: "{{name}} stellt vor",
          count_one: "{{count}} Karte",
          count_other: "{{count}} Karten",
          empty: "Keine Karten in dieser Zone.",
        },
        spotlight: "{{name}} stellt diese Karte gerade vor",
        walkthrough: {
          nextCard: "Nächste Karte",
          position: "Karte {{index}} von {{total}}",
        },
        scoped: {
          hint: "Du siehst die Karten der anderen, sobald sie vorgestellt werden.",
          facilitator:
            "Nur du siehst die Karten, die noch niemand vorgestellt hat.",
        },
      },
      focus: {
        label: "Fokusmodus",
        on: "Eine Karte nach der anderen",
        off: "Alle Karten zeigen",
      },
      group: {
        ungroup: "Aus Stapel lösen",
      },
      vote: {
        yourVotes: "Deine Stimmen",
        remaining_one: "{{count}} Stimme übrig",
        remaining_other: "{{count}} Stimmen übrig",
        meter: "{{done}}/{{total}} fertig abgestimmt",
        settings: "Abstimmung",
        votesPerPerson: "Stimmen pro Person",
        maxPerTarget: "Max. pro Karte",
        topN: "Top-Karten",
        apply: "Übernehmen",
        plus: "Stimme hinzufügen",
        minus: "Stimme entfernen",
        yours_one: "Deine Stimme: {{count}}",
        yours_other: "Deine Stimmen: {{count}}",
        voterMulti: "{{name}} ×{{count}}",
        voterLabel_one: "{{name}} hat {{count}} Stimme gegeben",
        voterLabel_other: "{{name}} hat {{count}} Stimmen gegeben",
        namesShown: "Namen werden mit dem Ergebnis gezeigt.",
        namesBlind: "Geheime Abstimmung — es werden keine Namen gezeigt.",
      },
      discuss: {
        queue: "Diskussion",
        focusCard: "Diese Karte diskutieren",
        clearFocus: "Alle Karten zeigen",
      },
      action: {
        title: "Action Items",
        placeholder: "Was nehmen wir uns vor?",
        add: "Hinzufügen",
        unassigned: "Ohne Verantwortliche:n",
        toggle: "Als erledigt markieren",
        delete: "Action Item löschen",
        empty:
          "Noch keine Action Items — haltet Entscheidungen beim Diskutieren fest.",
      },
      kudos: {
        title: "Wertschätzung",
        subtitle: "Endet positiv — schick einem Teammitglied etwas Liebe.",
        empty: "Noch kein Kudos. Sei die erste Person, die jemanden würdigt!",
        to: "An",
        placeholder: "Sag warum (optional)…",
        send: "Kudos senden",
        from: "— {{name}}",
        anonymous: "— anonym",
        anonymousSend: "Anonym senden",
        someone: "jemanden",
        everyone: "Alle",
        remove: "Kudo entfernen",
        card: {
          "thank-you": "Danke",
          "great-job": "Super gemacht",
          "well-done": "Gut gemacht",
          congratulations: "Glückwunsch",
          "totally-awesome": "Absolut großartig",
        },
      },
      gif: {
        add: "GIF",
        search: "GIFs suchen…",
        loading: "Suche…",
        none: "Keine GIFs gefunden.",
        hint: "Tippe, um nach einem GIF zu suchen.",
        unavailable: "GIF-Suche ist für dieses Board nicht eingerichtet.",
        failed:
          "Die GIF-Suche hat nicht geantwortet. Versuch es gleich nochmal.",
        throttled: "Ganz schön viele GIF-Suchen! Gib ihr ein paar Sekunden.",
        quota:
          "Das GIF-Limit für diese Stunde ist erreicht. Es kommt innerhalb der Stunde zurück — die Retro läuft normal weiter.",
        remove: "GIF entfernen",
        // NOT translated: KLIPY's API terms require the literal string
        // "Powered by KLIPY" (plus their logo, still to be added). An
        // attribution string is a brand asset, not UI copy.
        poweredBy: "Powered by KLIPY",
      },
      menu: {
        export: "Export",
        exportScope: "Umfang",
        scope: {
          all: "Alles",
          summary: "Zusammenfassung",
        },
        includeAuthors: "Namen der Autor:innen einschließen",
        rendering: "Wird erstellt…",
        imageFailed:
          "Das Bild konnte nicht erstellt werden. Versuche einen kleineren Umfang.",
        settings: "Board-Einstellungen",
        gifsEnabled: "GIFs erlauben",
        cursorsEnabled: "Live-Cursor (1 Aktualisierung/s)",
        voterNamesEnabled: "Zeigen, wer gestimmt hat (nach der Auflösung)",
        voterNamesLocked: "Ab Beginn der Abstimmung gesperrt.",
        voterNamesAnonymous: "Auf einem anonymen Board nicht verfügbar.",
        layout: "Board-Layout",
        layoutMode: {
          columns: "Spalten",
          canvas: "Canvas",
        },
        pickerStyle: "Auswahl-Stil",
        picker: {
          wheel: "Glücksrad",
          slots: "Slots",
          cards: "Karten",
        },
        duplicate: "Board duplizieren",
        duplicateName: "Kopie von {{name}}",
        retentionNotice: "Löscht sich automatisch am {{date}}",
        retentionKept: "Dieses Board wird behalten (keine Auto-Löschung).",
        keep: "Behalten",
        deleteNow: "Jetzt löschen",
        reallyDelete: "Wirklich löschen?",
      },
      roster: {
        makeFacilitator: "Zur Moderation machen",
        removeFacilitator: "Moderation entziehen",
        you: "(du)",
      },
      done: {
        title: "Retro abgeschlossen",
        body: "Dieses Board ist archiviert und schreibgeschützt.",
      },
      deleted: {
        title: "Board gelöscht",
        body: "Dieses Retro-Board wurde gelöscht.",
      },
      checkin: {
        icebreaker: "Check-in",
        noQuestion: "Aufwärmen…",
        shuffle: "Neue Frage",
        primeDirectiveTitle: "Die oberste Direktive",
        primeDirective:
          "Ungeachtet dessen, was wir herausfinden, verstehen und glauben wir aufrichtig, dass jede:r die bestmögliche Arbeit geleistet hat — angesichts des damaligen Wissensstands, der Fähigkeiten, der verfügbaren Ressourcen und der jeweiligen Situation.",
        agreements: "Arbeitsvereinbarungen",
        agreementsDefault:
          "• Vegas-Regel — was hier gesagt wird, bleibt hier\n• Probleme angreifen, nicht Personen\n• Immer nur ein Gespräch\n• Jede Stimme zählt",
        edit: "Bearbeiten",
      },
      roti: {
        title: "Return on Time Invested",
        question: "War diese Retro deine Zeit wert?",
        result: "Durchschnitt {{average}} · {{count}} Antworten",
        pending_one:
          "{{count}} Antwort bisher · der Durchschnitt wird zum Abschluss geteilt",
        pending_other:
          "{{count}} Antworten bisher · der Durchschnitt wird zum Abschluss geteilt",
        tooFew: "Zu wenige Antworten, um den Durchschnitt anonym zu teilen.",
        anonymous:
          "Anonym — nur der Durchschnitt wird geteilt, einmal am Ende.",
      },
      icebreaker: {
        "one-word": "Beschreibe diesen Sprint in einem Wort.",
        weather:
          "Wie ist dein Wetterbericht für den Sprint? (sonnig, stürmisch, neblig…)",
        "sprint-emoji": "Welches Emoji fasst deinen Sprint zusammen?",
        "energy-level": "Wie ist dein Energielevel gerade, 1 bis 10?",
        highlight: "Was war dein Highlight des Sprints?",
        learned: "Was hast du kürzlich gelernt?",
        superpower: "Wenn du diesen Sprint eine Superkraft hättest — welche?",
        "movie-title": "Wäre dieser Sprint ein Film, wie hieße er?",
        song: "Welcher Song beschreibt deine Woche?",
        animal: "Welches Tier passt heute zu deiner Stimmung?",
        "gif-week": "Welches GIF fasst deine Woche zusammen?",
        grateful: "Wofür bist du diesen Sprint dankbar?",
        surprise: "Was hat dich diesen Sprint überrascht?",
        "coffee-count": "Wie viele Kaffees hat dieser Sprint gekostet?",
        weekend: "Worauf freust du dich am Wochenende?",
        "hidden-talent":
          "Verrate ein verstecktes Talent, das hier niemand kennt.",
        "if-color": "Welche Farbe hat deine Stimmung heute?",
        "proud-of": "Worauf bist du aus diesem Sprint stolz?",
        recharge: "Wie tankst du nach einem harten Sprint auf?",
        "one-wish": "Ein Wunsch für den nächsten Sprint?",
        "team-word": "Ein Wort für das Team in diesem Sprint?",
        "looking-forward": "Worauf freust du dich im nächsten Sprint?",
        "waffle-or-pancake":
          "Waffeln oder Pfannkuchen — und warum ist das wichtig?",
        "desert-island": "Welches Tool nähmst du auf eine einsame Insel mit?",
      },
      status: {
        connecting: "Verbinde…",
        offline: "Verbindung verloren – verbinde neu…",
      },
      notFound: {
        title: "Board nicht gefunden",
        body: "Dieses Board existiert nicht oder wurde gelöscht.",
        home: "Neues Board erstellen",
      },
      lookupFailed: {
        title: "Board nicht erreichbar",
        body: "Das Board ist vermutlich in Ordnung — wir konnten nur nicht nachfragen. Prüfe deine Verbindung und versuche es erneut.",
        retry: "Erneut versuchen",
      },
      reject: {
        title: "Das hat nicht geklappt",
        PHASE_LOCKED: "Das geht in dieser Phase nicht.",
        NOT_ADMIN: "Das kann nur die Moderation.",
        NOT_AUTHOR: "Du kannst nur deine eigenen Karten ändern.",
        NOT_FOUND: "Diese Karte gibt es nicht mehr.",
        CONFLICT: "Jemand hat das gleichzeitig geändert. Versuch es nochmal.",
        INVALID: "Das hat nicht funktioniert — das Board wurde aktualisiert.",
        VOTE_BUDGET: "Du hast alle Stimmen vergeben.",
        RATE_LIMIT: "Zu viele Aktionen auf einmal. Kurz durchatmen.",
        CURSOR_BUDGET:
          "Live-Cursor sind zum Schutz des Free-Tier-Budgets für heute pausiert. Alles andere funktioniert weiter.",
        dismiss: "Schließen",
      },
      update: {
        available: "Auf dem Server läuft eine neuere Version von RetroBeam.",
        reload: "Neu laden",
      },
      error: {
        title: "Da ist etwas schiefgelaufen",
        body: "Das Board selbst ist sicher — es liegt auf dem Server. Neu laden verbindet dich wieder.",
        reload: "Board neu laden",
      },
      site: {
        nav: "Website",
      },
      landing: {
        kicker: "Retrospektiven für Teams",
        lede: "Geführte Retrospektiven im Browser — eine Person moderiert, alle schreiben erst privat, das Glücksrad entscheidet, wer vorstellt. Kostenlos und ohne Werbung.",
        cta: "Retro-Board erstellen",
        ctaHint: "Nur einen Boardnamen eingeben · kein Account nötig",
        trust: "Boards in der EU gespeichert · Open Source",
        howTitle: "So läuft eine Retro",
        steps: {
          share: {
            title: "Link teilen.",
            text: "Board erstellen, Link in den Team-Chat, Namen eintippen — drin.",
          },
          write: {
            title: "Privat schreiben, dann vorstellen.",
            text: "Niemand sieht fremde Notizen, bis das Glücksrad die Person aufruft, die als Nächstes dran ist.",
          },
          decide: {
            title: "Abstimmen, diskutieren, danke sagen.",
            text: "Verdeckt abstimmen, die Top-Karten diskutieren, Action Items nebenbei festhalten — und mit Kudos enden.",
          },
        },
        preview: {
          label: "Beispiel: ein Board in der Schreibphase",
          boardName: "Sprint 42",
          note1:
            "Pairing am Donnerstag hat den Bug in zwanzig Minuten gefunden.",
          note2: "Die Review-Queue ist wieder zu lang.",
          note3: "Täglicher Review-Slot um 11 Uhr",
          author1: "Mira",
          author2: "Mira",
          author3: "Mira",
        },
        whyTitle: "Warum RetroBeam",
        why: {
          private: {
            title: "Privat heißt privat.",
            text: "Fremde Notizen verlassen den Server erst, wenn sie dran sind — nicht nur im Browser versteckt.",
          },
          nothing: {
            title: "Nichts zu verwalten.",
            text: "Kein Account, kein Tracking, keine Sitzlizenzen; standardmäßig löschen sich Boards nach 90 Tagen von selbst.",
          },
          guided: {
            title: "Geführt, und trotzdem Spaß.",
            text: "Ein Phasen-Stepper führt durch die Retro; Glücksrad und Konfetti sorgen für die Momente.",
          },
          languages: {
            title: "Deutsch und Englisch.",
            text: "Mitten in der Retro umschaltbar; Boards liegen in EU-Rechenzentren.",
          },
        },
        faqTitle: "Fragen",
        faqGroups: {
          basics: "Erste Schritte",
          privacy: "Datenschutz und Sichtbarkeit",
          openSource: "Teams und Open Source",
        },
        faq: {
          cost: {
            q: "Was kostet das — und wo ist der Haken?",
            a: "Nichts: keine Bezahlpläne, keine Werbung, keine Board-Obergrenze. Der Haken: RetroBeam läuft auf dem kostenlosen Tarif von Cloudflare, und der hat ein Tageskontingent für die ganze Instanz. Wenn an einem Tag ungewöhnlich viele Teams Retro machen, kann es knapp werden — ab Mitternacht UTC geht es weiter, und wer das nicht riskieren will, hostet selbst.",
          },
          account: {
            q: "Brauche ich einen Account oder muss ich etwas installieren?",
            a: "Nein. Link öffnen, Namen eintippen, drin — keine Accounts, keine E-Mail-Abfrage, keine Erweiterung. Es läuft in aktuellen Browsern; getestet wird mit Chromium, Firefox und WebKit.",
          },
          where: {
            q: "Wo liegen die Daten?",
            a: "Jedes Board liegt in einem eigenen Cloudflare Durable Object, das beim Erstellen auf die EU festgelegt wird: Dauerhafter Board-Speicher und BoardRoom-Logik bleiben in EU-Rechenzentren. Offen gesagt: Cloudflare ist ein US-Unternehmen, und deine Verbindung sowie Teile der Anfrageverarbeitung laufen über den nächstgelegenen Cloudflare-Knoten, der außerhalb der EU liegen kann. Die Auftragsverarbeiter stehen in der Datenschutzerklärung.",
          },
          howLong: {
            q: "Wie lange bleiben die Daten?",
            a: "90 Tage ab Erstellung, dann löscht sich das Board von selbst. Die Moderation kann es jederzeit sofort löschen — oder ausdrücklich behalten, dann läuft keine Frist mehr. Empfehlung: Am Ende exportieren, dann löschen; der Export lässt Namen standardmäßig weg.",
          },
          whoReads: {
            q: "Wer kann meine Notizen lesen — und wann?",
            a: "In der Schreibphase niemand, auch nicht die Moderation: Der Server schickt fremde Notizen gar nicht erst an andere Browser. In der Vorstellrunde bekommt das Team die Karten einer Person aus den sichtbaren Spalten, sobald das Glücksrad sie aufruft. Danach sehen alle mit dem Link das freigegebene Board; Spalten, die die Moderation ausgeblendet lässt, bleiben nur für sie sichtbar. Der Link ist der einzige Schlüssel, also gib ihn nur deinem Team.",
          },
          facilitator: {
            q: "Sieht die Moderation mehr als das Team?",
            a: "In der Schreibphase nicht. In der Vorstellrunde ja: Die Moderation sieht von Anfang an das ganze Board, samt Namen, weil sie die Runde leitet und wissen muss, was noch kommt. Sobald alle vorgestellt haben, sehen alle dieselben sichtbaren Spalten; Spalten, welche die Moderation ausgeblendet lässt, bleiben nur für sie sichtbar.",
          },
          hideAuthors: {
            q: "Kann ich ausblenden, wer welche Karte geschrieben hat?",
            a: "Noch nicht. Kudos und die ROTI-Umfrage am Ende kannst du anonym abgeben, und während der Abstimmung sieht niemand, wer wofür gestimmt hat — aber die Namen an den Karten lassen sich derzeit nicht abschalten. Plane nicht damit, bis es da ist.",
          },
          gifs: {
            q: "Was ist mit den GIFs?",
            a: "Die GIF-Suche läuft über KLIPY, einen US-Anbieter; Suchbegriffe gehen über unseren Server, KLIPY sieht also weder deine IP-Adresse noch wer sucht. Die Bilder selbst lädt dein Browser aber direkt von KLIPYs CDN — und dabei sieht deren CDN deine IP-Adresse. Wer das vermeiden will, lässt GIFs von der Moderation abschalten, bevor jemand eines einfügt. Das verhindert Suchen und neue GIFs; bereits eingefügte GIFs werden bis zum Entfernen weiter von KLIPY geladen.",
          },
          selfHost: {
            q: "Kann ich RetroBeam selbst hosten?",
            a: "Ja. Es ist ein Cloudflare Worker plus ein Durable Object pro Board, ohne separaten Datenbankdienst, und läuft auch bei dir auf dem kostenlosen Tarif; die Schritte stehen im README auf GitHub. Für die GIF-Suche brauchst du einen eigenen KLIPY-Schlüssel — ohne ihn ist sie einfach aus.",
          },
          license: {
            q: "Unter welcher Lizenz steht der Code?",
            a: "AGPL-3.0-or-later. Du darfst RetroBeam nutzen, verändern und weitergeben; wer eine veränderte Version für andere über das Netz betreibt, muss diesen Personen den Quelltext anbieten. Der Quelltext der Version, die gerade hier läuft, ist im Footer verlinkt.",
          },
          commercial: {
            q: "Ist das ein kommerzielles Angebot?",
            a: "Nein. RetroBeam ist das private Projekt einer Person — keine Firma dahinter, keine Bezahlpläne, keine Werbung, und es werden keine Daten verkauft. Die Infrastruktur läuft auf Cloudflares kostenlosem Tarif; die übrigen Kosten, etwa für die Domain, trage ich selbst.",
          },
          work: {
            q: "Darf ich das im Unternehmen einsetzen — und was sagt der Betriebsrat?",
            a: "Technisch und lizenzrechtlich ja; ob dein Unternehmen es freigibt, entscheidet dein Unternehmen. In Deutschland fällt ein Tool mit Live-Anwesenheit und Notizen pro Person unter die Mitbestimmung (§ 87 Abs. 1 Nr. 6 BetrVG) — sprich den Betriebsrat also vorher an; die Datenaufstellung, die Auftragsverarbeiter und die Sache mit der Moderation stehen in docs/05 im Repository. Ehrlicherweise: Für retrobeam.de gibt es keinen Vertrag, keine Zusagen und keinen Auftragsverarbeitungsvertrag — wer das braucht, hostet selbst.",
          },
        },
        noticeTitle: "Kein kommerzielles Angebot",
        notice:
          "RetroBeam ist ein privates Projekt von Sebastian Grundhöfer, kein Unternehmen. Der Betrieb von retrobeam.de ist kostenlos, ohne Werbung, ohne Tracking und ohne Verkauf von Daten; die Kosten trage ich selbst. Der Quellcode ist frei unter der AGPL-3.0 — wer mag, betreibt eine eigene Instanz.",
      },
      legal: {
        license: "Freie Software: AGPL-3.0-or-later",
        redistribute: "Weitergabe und Änderung erlaubt, ohne Gewährleistung.",
        source: "Quelltext",
        sourceVersion: "Quelltext der hier laufenden Version",
        privacy: "Datenschutz",
        privacyTitle: "Datenschutzerklärung",
        imprint: "Impressum",
        imprintTitle: "Impressum",
        updated: "Stand:",
      },
    },
  },
} as const;

// Runs at module evaluation — storage-blocked contexts (hardened profiles,
// third-party iframes) throw on localStorage access and must not blank the app.
function initialLanguage(): "de" | "en" {
  try {
    const stored = localStorage.getItem(LANG_KEY);
    if (stored === "de" || stored === "en") return stored;
  } catch {
    // fall through to the navigator language
  }
  return navigator.language.toLowerCase().startsWith("de") ? "de" : "en";
}

// index.html ships lang="en"; screen readers and hyphenation pick their
// pronunciation/rules from it, so it has to follow the actual UI language —
// on load and on every switch.
function syncDocumentLanguage(lang: string): void {
  if (typeof document !== "undefined") {
    document.documentElement.lang = lang.startsWith("de") ? "de" : "en";
  }
}

void i18n.use(initReactI18next).init({
  resources,
  lng: initialLanguage(),
  fallbackLng: "en",
  interpolation: { escapeValue: false },
});
syncDocumentLanguage(i18n.language);

export function setLanguage(lang: "de" | "en"): void {
  try {
    localStorage.setItem(LANG_KEY, lang);
  } catch {
    // storage unavailable — the choice just won't persist
  }
  syncDocumentLanguage(lang);
  void i18n.changeLanguage(lang);
}

/** Exported for the DE/EN parity test — not part of the runtime surface. */
export const translationResources = resources;

export default i18n;
