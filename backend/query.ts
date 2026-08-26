import { PrismaClient } from '@prisma/client';
const db = new PrismaClient();
db.user.findMany().then(u => console.log(u)).finally(() => db.$disconnect());
