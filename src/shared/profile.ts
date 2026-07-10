import type { Profile, ProfileField } from "./types";

export const EMPTY_PROFILE: Profile = {
  version: 1,
  identity: {
    givenName: "",
    familyName: ""
  },
  contact: {
    emails: [{ label: "primary", value: "", primary: true }],
    phones: [{ label: "mobile", countryCode: "+1", number: "", primary: true }]
  },
  addresses: [
    {
      label: "home",
      street: "",
      city: "",
      postalCode: "",
      country: "US",
      primary: true
    }
  ],
  custom: []
};

export function cloneEmptyProfile(): Profile {
  return JSON.parse(JSON.stringify(EMPTY_PROFILE)) as Profile;
}

export function flattenProfile(profile: Profile): ProfileField[] {
  const fields: ProfileField[] = [];
  const push = (key: string, label: string, value: unknown) => {
    if (typeof value === "string" && value.trim() !== "") {
      fields.push({ key, label, value });
    }
  };

  push("identity.givenName", "Given name", profile.identity.givenName);
  push("identity.familyName", "Family name", profile.identity.familyName);
  push("identity.middleName", "Middle name", profile.identity.middleName);
  push("identity.dateOfBirth", "Date of birth", profile.identity.dateOfBirth);
  push("identity.gender", "Gender", profile.identity.gender);
  push("identity.nationality", "Nationality", profile.identity.nationality);
  push("identity.placeOfBirth", "Place of birth", profile.identity.placeOfBirth);

  profile.contact.emails.forEach((email, index) => {
    push(`contact.emails[${index}].value`, `${email.label} email`, email.value);
  });
  profile.contact.phones.forEach((phone, index) => {
    push(
      `contact.phones[${index}].number`,
      `${phone.label} phone`,
      `${phone.countryCode}${phone.number}`
    );
    push(
      `contact.phones[${index}].countryCode`,
      `${phone.label} phone country code`,
      phone.countryCode
    );
  });

  profile.addresses.forEach((address, index) => {
    const prefix = `addresses[${index}]`;
    const label = address.label;
    push(`${prefix}.street`, `${label} street`, address.street);
    push(`${prefix}.streetNumber`, `${label} street number`, address.streetNumber);
    push(`${prefix}.line2`, `${label} address line 2`, address.line2);
    push(`${prefix}.city`, `${label} city`, address.city);
    push(`${prefix}.region`, `${label} region`, address.region);
    push(`${prefix}.postalCode`, `${label} postal code`, address.postalCode);
    push(`${prefix}.country`, `${label} country`, address.country);
  });

  if (profile.documents) {
    push("documents.passportNumber", "Passport number", profile.documents.passportNumber);
    push("documents.passportExpiry", "Passport expiry", profile.documents.passportExpiry);
    push(
      "documents.passportIssuingCountry",
      "Passport issuing country",
      profile.documents.passportIssuingCountry
    );
    push("documents.nationalId", "National ID", profile.documents.nationalId);
    push("documents.taxId", "Tax ID", profile.documents.taxId);
    push("documents.driversLicense", "Driver's license", profile.documents.driversLicense);
  }

  if (profile.work) {
    push("work.company", "Company", profile.work.company);
    push("work.jobTitle", "Job title", profile.work.jobTitle);
    push("work.website", "Website", profile.work.website);
  }

  profile.custom.forEach((item) => {
    push(`custom.${item.key}`, item.label || item.key, item.value);
  });

  return fields;
}

export function getProfileValue(profile: Profile, key: string): string | undefined {
  return flattenProfile(profile).find((field) => field.key === key)?.value;
}

export function profileKeys(profile: Profile): string[] {
  return flattenProfile(profile).map((field) => field.key);
}
