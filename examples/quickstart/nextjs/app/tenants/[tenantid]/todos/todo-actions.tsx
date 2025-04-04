"use server";
// ^^^ This has to run on the server because it uses database operations and updates the cache

import { revalidatePath } from "next/cache";
import { configureNile } from "@/lib/NileServer";
import {
  aiEstimate,
  embedTask,
  embeddingToSQL,
  findSimilarTasks,
} from "@/lib/AiUtils";

export async function addTodo(
  tenantId: string,
  prevState: any,
  formData: FormData
) {
  // Each  a Nile instance is connected to our current tenant DB with the current user permissions
  let startTime = performance.now();
  const tenantNile = await configureNile(tenantId);
  let endTime = performance.now();
  let timeToConfigureNile = endTime - startTime;

  const title = formData.get("todo");
  console.log(
    "adding Todo " +
      title +
      " for tenant:" +
      tenantNile.tenantId +
      " for user:" +
      tenantNile.userId
  );
  if (!title) {
    return { message: "Please enter a title" };
  }

  let timeToEmbedTask = 0;
  let timeToFindSimilarTasks = 0;
  let timeToAiEstimate = 0;
  let embedding = null;
  let estimate: string | null =
    "Can't generate estimate because AI is not configured";

  try {
    // if AI is configured, we generate embeddings and estimate for the task
    if (process.env.AI_API_KEY) {
      // We also want to try and embed the task for future AI processing
      startTime = performance.now();
      embedding = await embedTask(title.toString());
      endTime = performance.now();
      timeToEmbedTask = endTime - startTime;
      // use embeddings to get some similar tasks, for reference
      startTime = performance.now();
      const similarTasks = await findSimilarTasks(
        tenantNile,
        title.toString(),
        embedding
      );
      endTime = performance.now();
      timeToFindSimilarTasks = endTime - startTime;
      // for each todo, we want to try and generate an AI estimate.
      startTime = performance.now();
      estimate = await aiEstimate(tenantNile, title.toString(), similarTasks);
      endTime = performance.now();
      timeToAiEstimate = endTime - startTime;
    }

    // need to set tenant ID because it is part of the primary key
    startTime = performance.now();
    await tenantNile.db.query(
      `INSERT INTO todos (tenant_id, title, estimate, embedding, complete)
        VALUES ($1, $2, $3, $4, $5)`,
      [
        tenantNile.tenantId,
        title,
        estimate?.substring(0, 255),
        embeddingToSQL(embedding),
        false,
      ]
    );
    endTime = performance.now();
    let timeToInsertTodo = endTime - startTime;
    startTime = performance.now();
    revalidatePath("/tenants/${tenantID}/todos");
    endTime = performance.now();
    let timeToRevalidate = endTime - startTime;
    revalidatePath("/tenants/[tenantid]/todos");
    return {
      Message: "Todo added successfully",
      // "Time to configure Nile (ms)": timeToConfigureNile,
      "Request embedding from LLM(ms)": timeToEmbedTask.toFixed(2),
      "Vector similarity search in Postgres (ms)":
        timeToFindSimilarTasks.toFixed(2),
      "Prompt response from LLM (ms)": timeToAiEstimate.toFixed(2),
      "Insert todo to Postgres (ms)": timeToInsertTodo.toFixed(2),
      // "Time to revalidate (ms)": timeToRevalidate,
    };
  } catch (e) {
    console.error(e);
    return { message: "Failed to add todo" };
  }
}

export async function completeTodo(
  tenantId: string,
  id: string,
  complete: boolean
) {
  // Each  a Nile instance is connected to our current tenant DB with the current user permissions
  const tenantNile = await configureNile(tenantId);
  console.log(
    "updating Todo " +
      id +
      " for tenant:" +
      tenantNile.tenantId +
      " for user:" +
      tenantNile.userId
  );
  try {
    // Tenant ID and user ID are in the context, so we don't need to specify them as query filters
    await tenantNile.db.query(
      `UPDATE todos 
      SET complete = $1
      WHERE id = $2`,
      [complete, id]
    );
    revalidatePath("/tenants/[tenantid]/todos");
  } catch (e) {
    console.error(e);
    return { message: "Failed to update todo" };
  }
}
