import { describe, it, expect } from "vitest";
import { ApplicationPayloadSchema } from "@/app/api/v1/applications/route";
import { DeliverableSubmissionSchema } from "@/app/api/v1/candidate/[applicationId]/deliverables/route";
import { CreateSupportTicketSchema } from "@/app/api/v1/candidate/[applicationId]/tickets/route";

describe("API Schema Validations (Remediates DATA-01, API-01, API-03)", () => {
  it("validates valid application payload", () => {
    const validData = {
      roleSlug: "backend-developer-intern",
      roleTitle: "Backend Developer Intern",
      fullName: "Naman Kalia",
      email: "namankalia1904@gmail.com",
      phone: "+917042199149",
      dateOfBirth: "2005-04-19",
      gender: "Male",
      currentCity: "Jaipur",
      permanentAddress: "Manipal University Jaipur, Rajasthan 303007",
      portfolioUrl: "https://drive.google.com/file/d/sample/view",
      linkedinUrl: "https://linkedin.com/in/naman-kalia",
      noticePeriod: "Immediate",
      technicalSkills: ["TypeScript", "Node.js", "PostgreSQL", "Prisma", "Redis", "Docker"],
      qualifications: [
        {
          highestQualification: "Bachelor's Degree",
          degree: "B.Tech",
          specialization: "Computer Science",
          institution: "Manipal University Jaipur",
          graduationYear: 2027,
          educationStatus: "Currently Pursuing",
          scoreSystem: "CGPA (Scale 1-10)",
          scoreValue: 8.5,
        },
      ],
      whyCynbitNarrative: "I want to work on core distributed systems and scalable backend infrastructure at Cynbit.",
      termsAccepted: true,
    };

    const res = ApplicationPayloadSchema.safeParse(validData);
    expect(res.success).toBe(true);
  });

  it("rejects application payload when terms are not accepted or email is invalid", () => {
    const invalidData = {
      roleSlug: "backend-developer-intern",
      roleTitle: "Backend Developer Intern",
      fullName: "Naman Kalia",
      email: "not-an-email",
      phone: "+917042199149",
      dateOfBirth: "2005-04-19",
      gender: "Male",
      currentCity: "Jaipur",
      permanentAddress: "Jaipur",
      portfolioUrl: "https://portfolio.com",
      linkedinUrl: "https://linkedin.com/in/test",
      noticePeriod: "Immediate",
      technicalSkills: ["Go"],
      qualifications: [
        {
          highestQualification: "Bachelor's Degree",
          degree: "B.Tech",
          specialization: "CSE",
          institution: "MUJ",
          graduationYear: 2027,
          educationStatus: "Currently Pursuing",
          scoreSystem: "CGPA (Scale 1-10)",
          scoreValue: 8.5,
        },
      ],
      whyCynbitNarrative: "Too short",
      termsAccepted: false,
    };

    const res = ApplicationPayloadSchema.safeParse(invalidData);
    expect(res.success).toBe(false);
  });

  it("validates deliverable submission constraints (max 4 additional links)", () => {
    const valid = {
      primaryDeliverableUrl: "https://github.com/NamTheGreat/cynbit-backend-audit",
      additionalDeliverableUrls: [
        "https://drive.google.com/file/d/audit-report.pdf",
        "https://cynbit-audit.vercel.app",
      ],
      executionNotes: "Completed passive telemetry deconstruction and production reference architecture.",
    };

    const res = DeliverableSubmissionSchema.safeParse(valid);
    expect(res.success).toBe(true);

    const tooManyLinks = {
      primaryDeliverableUrl: "https://github.com/repo",
      additionalDeliverableUrls: [
        "https://link1.com",
        "https://link2.com",
        "https://link3.com",
        "https://link4.com",
        "https://link5.com", // 5th additional link exceeds max 4
      ],
    };
    const resFail = DeliverableSubmissionSchema.safeParse(tooManyLinks);
    expect(resFail.success).toBe(false);
  });

  it("enforces allowed support ticket categories", () => {
    const valid = {
      category: "Assessment Task & Deliverable Issue",
      subject: "Query regarding test delivery",
      description: "Need clarification regarding the passive testing boundary conditions.",
    };
    expect(CreateSupportTicketSchema.safeParse(valid).success).toBe(true);

    const invalid = {
      category: "Random Unauthorized Category",
      subject: "Test",
      description: "Test description that is long enough",
    };
    expect(CreateSupportTicketSchema.safeParse(invalid).success).toBe(false);
  });
});
