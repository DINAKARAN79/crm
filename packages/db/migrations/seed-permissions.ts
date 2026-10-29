import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const PERMISSIONS = [
  // FULL SYSTEM
  { name: 'FULL_SYSTEM_ACCESS', label: 'Full System Access', module: 'SYSTEM', action: 'FULL_ACCESS', description: 'Grants access to all modules and actions' },

  // LEAD
  { name: 'LEAD_READ', label: 'View Lead', module: 'LEAD', action: 'READ' },
  { name: 'LEAD_CREATE', label: 'Create Lead', module: 'LEAD', action: 'CREATE' },
  { name: 'LEAD_UPDATE', label: 'Update Lead', module: 'LEAD', action: 'UPDATE' },
  { name: 'LEAD_DELETE', label: 'Delete Lead', module: 'LEAD', action: 'DELETE' },
  { name: 'LEAD_ASSIGN', label: 'Assign Lead', module: 'LEAD', action: 'ASSIGN' },
  { name: 'LEAD_CHANGE_STATUS', label: 'Change Lead Status', module: 'LEAD', action: 'CHANGE_STATUS' },
  { name: 'LEAD_MOVE_TO_RECOVERY', label: 'Move Lead to Recovery', module: 'LEAD', action: 'MOVE_TO_RECOVERY' },
  { name: 'LEAD_EXPORT', label: 'Export Leads', module: 'LEAD', action: 'EXPORT' },

  // REQUIREMENT
  { name: 'REQUIREMENT_READ', label: 'View Requirement', module: 'REQUIREMENT', action: 'READ' },
  { name: 'REQUIREMENT_CREATE', label: 'Create Requirement', module: 'REQUIREMENT', action: 'CREATE' },
  { name: 'REQUIREMENT_UPDATE', label: 'Update Requirement', module: 'REQUIREMENT', action: 'UPDATE' },
  { name: 'REQUIREMENT_DELETE', label: 'Delete Requirement', module: 'REQUIREMENT', action: 'DELETE' },

  // SITE VISIT
  { name: 'SITE_VISIT_READ', label: 'View Site Visit', module: 'SITE_VISIT', action: 'READ' },
  { name: 'SITE_VISIT_CREATE', label: 'Create Site Visit', module: 'SITE_VISIT', action: 'CREATE' },
  { name: 'SITE_VISIT_UPDATE', label: 'Update Site Visit', module: 'SITE_VISIT', action: 'UPDATE' },
  { name: 'SITE_VISIT_ASSIGN', label: 'Assign Site Visit', module: 'SITE_VISIT', action: 'ASSIGN' },
  { name: 'SITE_VISIT_COMPLETE', label: 'Complete Site Visit', module: 'SITE_VISIT', action: 'COMPLETE' },
  { name: 'SITE_VISIT_DELETE', label: 'Delete Site Visit', module: 'SITE_VISIT', action: 'DELETE' },

  // PROPOSAL
  { name: 'PROPOSAL_READ', label: 'View Proposal', module: 'PROPOSAL', action: 'READ' },
  { name: 'PROPOSAL_CREATE', label: 'Create Proposal', module: 'PROPOSAL', action: 'CREATE' },
  { name: 'PROPOSAL_UPDATE', label: 'Update Proposal', module: 'PROPOSAL', action: 'UPDATE' },
  { name: 'PROPOSAL_DELETE', label: 'Delete Proposal', module: 'PROPOSAL', action: 'DELETE' },

  // REPORT
  { name: 'REPORT_VIEW', label: 'View Reports', module: 'REPORT', action: 'VIEW' },
  { name: 'REPORT_EXPORT', label: 'Export Reports', module: 'REPORT', action: 'EXPORT' },

  // PROJECT
  { name: 'PROJECT_READ', label: 'View Project', module: 'PROJECT', action: 'READ' },
  { name: 'PROJECT_CREATE', label: 'Create Project', module: 'PROJECT', action: 'CREATE' },
  { name: 'PROJECT_UPDATE', label: 'Update Project', module: 'PROJECT', action: 'UPDATE' },
  { name: 'PROJECT_DELETE', label: 'Delete Project', module: 'PROJECT', action: 'DELETE' },
  { name: 'UNIT_READ', label: 'View Unit', module: 'UNIT', action: 'READ' },

  // TASK
  { name: 'TASK_READ', label: 'View Task', module: 'TASK', action: 'READ' },
  { name: 'TASK_CREATE', label: 'Create Task', module: 'TASK', action: 'CREATE' },
  { name: 'TASK_UPDATE', label: 'Update Task', module: 'TASK', action: 'UPDATE' },
  { name: 'TASK_DELETE', label: 'Delete Task', module: 'TASK', action: 'DELETE' },

  // FOLLOW_UP
  { name: 'FOLLOW_UP_READ', label: 'View Follow-up', module: 'FOLLOW_UP', action: 'READ' },
  { name: 'FOLLOW_UP_CREATE', label: 'Create Follow-up', module: 'FOLLOW_UP', action: 'CREATE' },
  { name: 'FOLLOW_UP_UPDATE', label: 'Update Follow-up', module: 'FOLLOW_UP', action: 'UPDATE' },
  { name: 'FOLLOW_UP_DELETE', label: 'Delete Follow-up', module: 'FOLLOW_UP', action: 'DELETE' },

  // USER
  { name: 'USER_READ', label: 'View Users', module: 'USER', action: 'READ' },
  { name: 'USER_CREATE', label: 'Create User', module: 'USER', action: 'CREATE' },
  { name: 'USER_UPDATE', label: 'Update User', module: 'USER', action: 'UPDATE' },
  { name: 'USER_DELETE', label: 'Delete User', module: 'USER', action: 'DELETE' },
  { name: 'USER_ACTIVATE', label: 'Activate User', module: 'USER', action: 'ACTIVATE' },
  { name: 'USER_DEACTIVATE', label: 'Deactivate User', module: 'USER', action: 'DEACTIVATE' },
  { name: 'USER_PASSWORD_RESET', label: 'Reset User Password', module: 'USER', action: 'PASSWORD_RESET' },

  // ROLE
  { name: 'ROLE_READ', label: 'View Roles', module: 'ROLE', action: 'READ' },
  { name: 'ROLE_CREATE', label: 'Create Role', module: 'ROLE', action: 'CREATE' },
  { name: 'ROLE_UPDATE', label: 'Update Role', module: 'ROLE', action: 'UPDATE' },
  { name: 'ROLE_DELETE', label: 'Delete Role', module: 'ROLE', action: 'DELETE' },

  // PROFILE
  { name: 'PROFILE_READ', label: 'View Profiles', module: 'PROFILE', action: 'READ' },
  { name: 'PROFILE_CREATE', label: 'Create Profile', module: 'PROFILE', action: 'CREATE' },
  { name: 'PROFILE_UPDATE', label: 'Update Profile', module: 'PROFILE', action: 'UPDATE' },
  { name: 'PROFILE_DELETE', label: 'Delete Profile', module: 'PROFILE', action: 'DELETE' },
  { name: 'PROFILE_PERMISSION_MANAGE', label: 'Manage Profile Permissions', module: 'PROFILE', action: 'PERMISSION_MANAGE' },

  // PERMISSION SET
  { name: 'PERMISSION_SET_READ', label: 'View Permission Sets', module: 'PERMISSION_SET', action: 'READ' },
  { name: 'PERMISSION_SET_CREATE', label: 'Create Permission Set', module: 'PERMISSION_SET', action: 'CREATE' },
  { name: 'PERMISSION_SET_UPDATE', label: 'Update Permission Set', module: 'PERMISSION_SET', action: 'UPDATE' },
  { name: 'PERMISSION_SET_DELETE', label: 'Delete Permission Set', module: 'PERMISSION_SET', action: 'DELETE' },
  { name: 'PERMISSION_SET_ASSIGN', label: 'Assign Permission Sets', module: 'PERMISSION_SET', action: 'ASSIGN' },

  // DIRECT USER PERMISSION
  { name: 'USER_PERMISSION_READ', label: 'View User Permissions', module: 'USER_PERMISSION', action: 'READ' },
  { name: 'USER_PERMISSION_ADD', label: 'Add User Permission', module: 'USER_PERMISSION', action: 'ADD' },
  { name: 'USER_PERMISSION_REMOVE', label: 'Remove User Permission', module: 'USER_PERMISSION', action: 'REMOVE' },

  // DASHBOARD
  { name: 'DASHBOARD_READ', label: 'View Dashboard', module: 'DASHBOARD', action: 'READ' },
  { name: 'DASHBOARD_CREATE', label: 'Create Dashboard', module: 'DASHBOARD', action: 'CREATE' },
  { name: 'DASHBOARD_UPDATE', label: 'Update Dashboard', module: 'DASHBOARD', action: 'UPDATE' },
  { name: 'DASHBOARD_DELETE', label: 'Delete Dashboard', module: 'DASHBOARD', action: 'DELETE' },

  // WORKFLOW
  { name: 'WORKFLOW_READ', label: 'View Workflows', module: 'WORKFLOW', action: 'READ' },
  { name: 'WORKFLOW_CREATE', label: 'Create Workflow', module: 'WORKFLOW', action: 'CREATE' },
  { name: 'WORKFLOW_UPDATE', label: 'Update Workflow', module: 'WORKFLOW', action: 'UPDATE' },
  { name: 'WORKFLOW_DELETE', label: 'Delete Workflow', module: 'WORKFLOW', action: 'DELETE' },

  // AUDIT
  { name: 'AUDIT_READ', label: 'View Audit Logs', module: 'AUDIT', action: 'READ' },
];

async function main() {
  console.log('Seeding permissions catalog...');

  for (const perm of PERMISSIONS) {
    await prisma.permission.upsert({
      where: { name: perm.name },
      update: { label: perm.label, module: perm.module, action: perm.action, description: perm.description || null },
      create: perm,
    });
  }

  console.log(`Seeded ${PERMISSIONS.length} permissions.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });