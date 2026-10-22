/**
 * The app's two legal documents, as text the legal page draws (./index.tsx). Plain data: a heading and its
 * paragraphs per section. `[Developer name]` and `[contact email]` are placeholders the publisher fills in before
 * release.
 */
export type LegalDoc = 'privacy' | 'terms';

type Section = { heading: string; paragraphs: string[] };

type Document = { title: string; updated: string; intro: string; sections: Section[] };

const UPDATED = '22 October 2026';
const CONTACT = 'Questions about this document go to [Developer name] at [contact email].';

export const LEGAL_DOCS = {
  privacy: {
    title: 'Privacy Policy',
    updated: UPDATED,
    intro:
      'This Privacy Policy explains what information Merchant ("the app"), published by [Developer name], collects when you use it, how that information is used, and the choices you have.',
    sections: [
      {
        heading: 'Information we collect',
        paragraphs: [
          'Account information. When you sign in with Google or Facebook, we receive your name, email address and profile photo from that provider. We do not receive or store your Google or Facebook password.',
          'Store records. The stores you create and everything you enter in them — items, prices, stock, sales, payments, employees, roles and settings — are stored so the app can show them to you and to the people you let into your store.',
          'Access requests. When you use an access code, the store owner receives your name, email address and photo so they can decide whether to let you in.',
          'Camera and photos. Scan Product and Scan to Sell use the camera, and Choose Photo reads a picture you pick. Barcodes and label text are read on your phone; the pictures are not uploaded.',
          'Files. Import Items reads the file you choose on your phone, and Download Template saves a file to the folder you pick.',
        ],
      },
      {
        heading: 'How we use information',
        paragraphs: [
          'To sign you in and keep you signed in; to run your stores and show their records to you and to the employees you allow; to notify you about access codes and requests; and to keep the service secure and working.',
          'We do not sell your information, and we do not use it for advertising.',
        ],
      },
      {
        heading: 'Who processes it',
        paragraphs: [
          'Your account and store records are stored with Supabase, our database and sign-in provider. Google and Meta (Facebook) handle the sign-in you choose under their own privacy policies. They process information only to provide those services.',
          'Inside a store, the owner and the employees the owner gives permissions to can see the records their permissions reach.',
        ],
      },
      {
        heading: 'Security',
        paragraphs: [
          'Your session is kept in your phone\'s secure storage (the iOS Keychain or the Android Keystore). Every request to the database is checked against your account and your permissions in that store. No system is perfectly secure, but we work to protect your information.',
        ],
      },
      {
        heading: 'Keeping and deleting information',
        paragraphs: [
          'We keep your information for as long as your account exists. You can remove a store you own from the Home page, which deletes everything kept in it. You can delete your account at any time from Account → Delete account; this deletes your account and every store you own.',
        ],
      },
      {
        heading: 'Children',
        paragraphs: ['The app is meant for running a business and is not directed at children under 13. We do not knowingly collect information from them.'],
      },
      {
        heading: 'Changes to this policy',
        paragraphs: ['We may update this policy. When we do, we change the date at the top. Using the app after a change means you accept the updated policy.'],
      },
      { heading: 'Contact', paragraphs: [CONTACT] },
    ],
  },
  terms: {
    title: 'Terms of Service',
    updated: UPDATED,
    intro:
      'These Terms of Service govern your use of Merchant ("the app"), published by [Developer name]. By signing in, you agree to them. If you do not agree, do not use the app.',
    sections: [
      {
        heading: 'Your account',
        paragraphs: [
          'You sign in with a Google or Facebook account and are responsible for what happens under it. You must be old enough to form a binding contract where you live, and you must use the app only for lawful business purposes.',
        ],
      },
      {
        heading: 'Stores, owners and employees',
        paragraphs: [
          'The person who creates a store is its owner. The owner decides who may join with an access code, which role and permissions each employee has, and when to remove someone or delete the store.',
          'Employees act on the owner\'s behalf and may see and change only what their permissions allow. The owner is responsible for the people they let in.',
        ],
      },
      {
        heading: 'Your data',
        paragraphs: [
          'The records you enter belong to you or to the store\'s owner. You give us permission to store and process them only to provide the app. Our Privacy Policy explains how.',
        ],
      },
      {
        heading: 'Acceptable use',
        paragraphs: [
          'Do not try to reach stores or records you were not given access to, guess access codes, disrupt the service, reverse-engineer it beyond what the law allows, or use it to break any law, including tax and consumer law.',
        ],
      },
      {
        heading: 'Your responsibility for your books',
        paragraphs: [
          'The app helps you record sales, taxes, stock and accounts, but it is not tax, legal or accounting advice. You are responsible for checking that your prices, taxes, receipts and records are correct and meet the rules that apply to your business.',
        ],
      },
      {
        heading: 'Availability and changes',
        paragraphs: [
          'We work to keep the app available but do not promise it will always be, or that it will be free of errors. We may change, add or remove features. Keep your own copies of records you are required to keep.',
        ],
      },
      {
        heading: 'Disclaimer and limitation of liability',
        paragraphs: [
          'The app is provided "as is". To the extent the law allows, we are not liable for indirect or consequential losses, lost profits or lost data arising from your use of the app.',
        ],
      },
      {
        heading: 'Ending your use',
        paragraphs: [
          'You may stop using the app and delete your account at any time. We may suspend or close an account that breaks these terms.',
        ],
      },
      {
        heading: 'Changes to these terms',
        paragraphs: ['We may update these terms. When we do, we change the date at the top. Using the app after a change means you accept the updated terms.'],
      },
      { heading: 'Contact', paragraphs: [CONTACT] },
    ],
  },
} satisfies Record<LegalDoc, Document>;

export const isLegalDoc = (value: string | undefined): value is LegalDoc => value === 'privacy' || value === 'terms';
