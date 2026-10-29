import { prisma } from "@dct-crm/db";
import { projectMapUrl, resolveProjectLocation } from "../services/projectLocation";

const projectNames = ["DCT Valley", "DCT Heights", "DCT Paradise"];

interface Coordinates {
  latitude: number;
  longitude: number;
}

function readCoordinates(): Record<string, Coordinates> {
  const value = process.env.PROJECT_LOCATION_BACKFILL_JSON;
  if (!value) {
    throw new Error("Set PROJECT_LOCATION_BACKFILL_JSON with coordinates for all three DCT projects.");
  }

  const parsed = JSON.parse(value) as Record<string, Coordinates>;
  for (const name of projectNames) {
    const point = parsed[name];
    if (!point || !Number.isFinite(point.latitude) || point.latitude < -90 || point.latitude > 90 ||
        !Number.isFinite(point.longitude) || point.longitude < -180 || point.longitude > 180) {
      throw new Error(`Valid latitude and longitude are required for ${name}.`);
    }
  }
  return parsed;
}

async function main() {
  const coordinates = readCoordinates();
  for (const name of projectNames) {
    const projects = await prisma.project.findMany({
      where: { name: { equals: name, mode: "insensitive" } },
    });
    if (projects.length === 0) throw new Error(`No project named ${name} was found.`);

    const point = coordinates[name];
    const location = await resolveProjectLocation(point.latitude, point.longitude);
    for (const project of projects) {
      await prisma.project.update({
        where: { id: project.id },
        data: {
          latitude: point.latitude,
          longitude: point.longitude,
          address: location.locationName,
          city: location.city || project.city,
          state: location.state || project.state,
          mapUrl: projectMapUrl(point.latitude, point.longitude),
        },
      });
      console.log(`Updated ${project.name} (${project.id}): ${location.locationName}`);
    }
  }
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());