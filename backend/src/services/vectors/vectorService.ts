import { prisma } from "../../config/db";

export const createVector = async (
  id: string,
  content: string,
  embedding: number[]
) => {
  await prisma.$executeRaw`
    INSERT INTO "YourTable" (
      id,
      content,
      embedding
    )
    VALUES (
      ${id},
      ${content},
      ${embedding}::vector
    );
  `;
};


export const getVectorById = async (id: string) => {
  const result = await prisma.$queryRaw`
    SELECT *
    FROM "YourTable"
    WHERE id = ${id};
  `;

  return result;
};



export const searchSimilarVectors = async (
  embedding: number[],
  limit: number = 5
) => {
  const result = await prisma.$queryRaw`
    SELECT *,
           embedding <=> ${embedding}::vector AS distance
    FROM "YourTable"
    ORDER BY distance
    LIMIT ${limit};
  `;

  return result;
};



export const updateVector = async (
  id: string,
  embedding: number[]
) => {
  await prisma.$executeRaw`
    UPDATE "YourTable"
    SET embedding = ${embedding}::vector
    WHERE id = ${id};
  `;
};


export const deleteVector = async (id: string) => {
  await prisma.$executeRaw`
    DELETE FROM "YourTable"
    WHERE id = ${id};
  `;
};