import { PrismaClient, TaskStatus, TaskPriority } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const PASSWORD = "password123";

async function main() {
  console.log("Seeding database…");

  const passwordHash = await bcrypt.hash(PASSWORD, 10);

  const org = await prisma.organization.create({
    data: { name: "Acme Analytics", slug: "acme-analytics" },
  });

  const [noida, gurgaon] = await Promise.all([
    prisma.center.create({
      data: { organizationId: org.id, name: "Noida Center", code: "NOI", timezone: "Asia/Kolkata", address: "Sector 62, Noida" },
    }),
    prisma.center.create({
      data: { organizationId: org.id, name: "Gurgaon Center", code: "GGN", timezone: "Asia/Kolkata", address: "Cyber City, Gurgaon" },
    }),
  ]);

  const [engineering, sales, support] = await Promise.all([
    prisma.department.create({ data: { organizationId: org.id, name: "Engineering" } }),
    prisma.department.create({ data: { organizationId: org.id, name: "Sales" } }),
    prisma.department.create({ data: { organizationId: org.id, name: "Support" } }),
  ]);

  // Level 1: Owner
  const alice = await prisma.user.create({
    data: {
      organizationId: org.id,
      email: "alice@acme.test",
      name: "Alice Sharma",
      passwordHash,
      role: "OWNER",
      status: "ACTIVE",
      centerId: noida.id,
      departmentId: engineering.id,
      title: "Chief Executive Officer",
      startDate: new Date("2022-01-10"),
    },
  });

  // Level 2: Managers (also center heads)
  const bob = await prisma.user.create({
    data: {
      organizationId: org.id,
      email: "bob@acme.test",
      name: "Bob Verma",
      passwordHash,
      role: "MANAGER",
      status: "ACTIVE",
      centerId: noida.id,
      departmentId: engineering.id,
      managerId: alice.id,
      title: "Engineering Manager",
      isCenterHead: true,
      startDate: new Date("2022-03-01"),
    },
  });

  const carol = await prisma.user.create({
    data: {
      organizationId: org.id,
      email: "carol@acme.test",
      name: "Carol Singh",
      passwordHash,
      role: "MANAGER",
      status: "ACTIVE",
      centerId: gurgaon.id,
      departmentId: sales.id,
      managerId: alice.id,
      title: "Sales Manager",
      isCenterHead: true,
      startDate: new Date("2022-04-15"),
    },
  });

  const dave = await prisma.user.create({
    data: {
      organizationId: org.id,
      email: "dave@acme.test",
      name: "Dave Kapoor",
      passwordHash,
      role: "MANAGER",
      status: "ACTIVE",
      centerId: noida.id,
      departmentId: support.id,
      managerId: alice.id,
      title: "Support Manager",
      startDate: new Date("2022-05-20"),
    },
  });

  await prisma.department.update({ where: { id: engineering.id }, data: { headUserId: bob.id } });
  await prisma.department.update({ where: { id: sales.id }, data: { headUserId: carol.id } });
  await prisma.department.update({ where: { id: support.id }, data: { headUserId: dave.id } });

  // Level 3: Employees
  const employeeSeeds: {
    name: string;
    email: string;
    managerId: string;
    centerId: string;
    departmentId: string;
    title: string;
  }[] = [
    { name: "Eve Malhotra", email: "eve@acme.test", managerId: bob.id, centerId: noida.id, departmentId: engineering.id, title: "Software Engineer" },
    { name: "Frank D'Souza", email: "frank@acme.test", managerId: bob.id, centerId: noida.id, departmentId: engineering.id, title: "Software Engineer" },
    { name: "Grace Nair", email: "grace@acme.test", managerId: bob.id, centerId: noida.id, departmentId: engineering.id, title: "QA Engineer" },
    { name: "Hiten Shah", email: "hiten@acme.test", managerId: bob.id, centerId: gurgaon.id, departmentId: engineering.id, title: "Software Engineer" },
    { name: "Isha Reddy", email: "isha@acme.test", managerId: carol.id, centerId: gurgaon.id, departmentId: sales.id, title: "Account Executive" },
    { name: "Jay Patel", email: "jay@acme.test", managerId: carol.id, centerId: gurgaon.id, departmentId: sales.id, title: "Account Executive" },
    { name: "Kavya Iyer", email: "kavya@acme.test", managerId: carol.id, centerId: gurgaon.id, departmentId: sales.id, title: "Sales Development Rep" },
    { name: "Liam Fernandes", email: "liam@acme.test", managerId: carol.id, centerId: noida.id, departmentId: sales.id, title: "Account Executive" },
    { name: "Meera Joshi", email: "meera@acme.test", managerId: dave.id, centerId: noida.id, departmentId: support.id, title: "Support Specialist" },
    { name: "Nikhil Rao", email: "nikhil@acme.test", managerId: dave.id, centerId: noida.id, departmentId: support.id, title: "Support Specialist" },
    { name: "Olivia Menon", email: "olivia@acme.test", managerId: dave.id, centerId: gurgaon.id, departmentId: support.id, title: "Support Lead" },
  ];

  const employees = [];
  for (const seed of employeeSeeds) {
    const user = await prisma.user.create({
      data: {
        organizationId: org.id,
        email: seed.email,
        name: seed.name,
        passwordHash,
        role: "EMPLOYEE",
        status: "ACTIVE",
        centerId: seed.centerId,
        departmentId: seed.departmentId,
        managerId: seed.managerId,
        title: seed.title,
        startDate: new Date("2023-01-01"),
      },
    });
    employees.push(user);
  }

  const allStaff = [bob, carol, dave, ...employees];
  console.log(`Created ${allStaff.length + 1} users`);

  // ── Tasks ─────────────────────────────────────────────────────────────
  const statuses: TaskStatus[] = ["BACKLOG", "TODO", "IN_PROGRESS", "IN_REVIEW", "DONE", "BLOCKED"];
  const priorities: TaskPriority[] = ["LOW", "MEDIUM", "HIGH", "URGENT"];

  const taskTitles = [
    "Fix login redirect bug", "Design new onboarding flow", "Migrate database indices",
    "Write Q3 sales pitch deck", "Review support ticket backlog", "Update client contract templates",
    "Set up CI pipeline for API", "Investigate slow dashboard queries", "Prepare client demo for Acme Retail",
    "Refactor task board drag-drop", "Audit user permission matrix", "Draft monthly newsletter",
    "Resolve payment gateway timeout", "Create onboarding checklist for new hires", "Update knowledge base articles",
    "Plan Q4 hiring roadmap", "Fix mobile responsive layout bugs", "Set up alerting for API errors",
    "Negotiate renewal with Beta Corp", "Conduct customer satisfaction survey", "Optimize image upload pipeline",
    "Prepare quarterly board deck", "Test new notification templates", "Review and merge pending PRs",
    "Coordinate office move logistics", "Build export-to-PDF feature", "Investigate churn in Gurgaon accounts",
    "Update security compliance docs", "Set up new hire laptops", "Design team offsite agenda",
    "Fix flaky end-to-end tests", "Improve search relevance ranking", "Handle escalated support case #4021",
    "Draft partnership proposal", "Clean up unused API endpoints", "Localize app for Hindi users",
    "Benchmark database read replicas", "Prepare training for new support reps", "Update pricing page copy",
    "Reconcile monthly expense reports",
  ];

  const ongoingTitles = [
    "Monitor client support inbox", "Daily standup facilitation", "Weekly infra health check",
    "Ongoing competitor research", "Continuous code review rotation", "Monthly payroll reconciliation",
    "Client relationship check-ins", "Server uptime monitoring",
  ];

  let taskCount = 0;
  const today = new Date();

  for (let i = 0; i < taskTitles.length; i++) {
    const assignee = allStaff[i % allStaff.length];
    const status = statuses[i % statuses.length];
    const priority = priorities[i % priorities.length];
    const dueDate = new Date(today.getTime() + (i % 14 - 7) * 24 * 60 * 60 * 1000);

    const task = await prisma.task.create({
      data: {
        organizationId: org.id,
        title: taskTitles[i],
        description: `Details for "${taskTitles[i]}".`,
        status,
        priority,
        assigneeId: assignee.id,
        createdById: alice.id,
        centerId: assignee.centerId,
        departmentId: assignee.departmentId,
        dueDate,
        estimatedHours: 4 + (i % 5) * 2,
        blockedReason: status === "BLOCKED" ? "Waiting on external dependency" : null,
        tags: { create: i % 3 === 0 ? [{ label: "priority" }] : [] },
      },
    });
    taskCount++;

    await prisma.taskActivity.create({
      data: { taskId: task.id, userId: alice.id, type: "CREATED", message: `Created task "${task.title}"` },
    });

    await prisma.taskComment.create({
      data: {
        taskId: task.id,
        userId: assignee.id,
        comment: status === "DONE" ? "Completed and verified." : "Working through this now.",
        statusChangedTo: status,
      },
    });

    // Time logs on the last few days for non-backlog tasks
    if (status !== "BACKLOG") {
      for (let d = 0; d < (i % 3) + 1; d++) {
        const date = new Date(today.getTime() - d * 24 * 60 * 60 * 1000);
        await prisma.taskLog.create({
          data: { taskId: task.id, userId: assignee.id, date, hoursLogged: 2 + (d % 3) * 2 },
        });
      }
    }

    // Add subtasks to every 5th task
    if (i % 5 === 0) {
      for (let s = 0; s < 2; s++) {
        await prisma.task.create({
          data: {
            organizationId: org.id,
            title: `${task.title} — part ${s + 1}`,
            status: s === 0 ? "DONE" : "TODO",
            priority,
            assigneeId: assignee.id,
            createdById: alice.id,
            centerId: assignee.centerId,
            departmentId: assignee.departmentId,
            parentTaskId: task.id,
          },
        });
        taskCount++;
      }
    }
  }

  // Ongoing / recurring tasks
  for (let i = 0; i < ongoingTitles.length; i++) {
    const assignee = allStaff[i % allStaff.length];
    await prisma.task.create({
      data: {
        organizationId: org.id,
        title: ongoingTitles[i],
        description: "Recurring responsibility with no fixed completion date.",
        status: "ONGOING",
        priority: priorities[i % priorities.length],
        isRecurring: true,
        assigneeId: assignee.id,
        createdById: alice.id,
        centerId: assignee.centerId,
        departmentId: assignee.departmentId,
      },
    });
    taskCount++;
  }

  console.log(`Created ${taskCount} tasks (including subtasks and ongoing tasks)`);
  console.log("\nSeed complete. All users share the password:", PASSWORD);
  console.log("Try logging in as alice@acme.test (OWNER), bob@acme.test (MANAGER), or eve@acme.test (EMPLOYEE).");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
