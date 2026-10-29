import "../loadEnv";
import { prisma } from "@dct-crm/db";
import { ProjectLocationError } from "../services/googleMapsGeocoding";
import { projectMapUrl, resolveProjectLocation } from "../services/projectLocation";

async function main() {
  const projects = await prisma.project.findMany({
    where: { latitude: { not: null }, longitude: { not: null } },
    select: {
      id: true,
      name: true,
      latitude: true,
      longitude: true,
      address: true,
      city: true,
      state: true,
      mapUrl: true,
    },
    orderBy: { createdAt: "asc" },
  });

  let updated = 0;
  let failed = 0;

  console.log(`Refreshing location names for ${projects.length} projects with coordinates...`);

  for (const project of projects) {
    const latitude = Number(project.latitude);
    const longitude = Number(project.longitude);
    if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90 ||
        !Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
      console.error(`Skipped ${project.name} (${project.id}): invalid coordinates.`);
      failed += 1;
      continue;
    }

    try {
      const location = await resolveProjectLocation(latitude, longitude);
      await prisma.project.update({
        where: { id: project.id },
        data: {
          address: location.locationName,
          city: location.city || project.city,
          state: location.state || project.state,
          mapUrl: projectMapUrl(latitude, longitude),
        },
      });
      console.log(`Updated ${project.name} (${project.id}): ${location.locationName}`);
      updated += 1;
    } catch (error) {
      const reason = error instanceof ProjectLocationError ? error.message : "Unexpected location lookup failure.";
      console.error(`Failed ${project.name} (${project.id}): ${reason}`);
      failed += 1;
    }
  }

  console.log(`Project location backfill complete: updated=${updated}, failed=${failed}, skipped without coordinates=${await prisma.project.count({ where: { OR: [{ latitude: null }, { longitude: null }] } })}`);
  if (failed > 0) process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error("Project location backfill failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());