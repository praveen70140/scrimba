const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function main() {
  try {
    const count = await prisma.course.count();
    console.log("Count:", count);
  } catch(e) {
    console.error(e.message);
  } finally {
    await prisma.$disconnect();
  }
}
main();
