const FIELDS = 'id title description status createdAt updatedAt';

export const LIST_TASKS = `query ListTasks($status: TaskStatus) { tasks(status: $status, limit: 100) { ${FIELDS} } }`;
export const CREATE_TASK = `mutation CreateTask($input: CreateTaskInput!) { createTask(input: $input) { ${FIELDS} } }`;
export const UPDATE_TASK = `mutation UpdateTask($id: ID!, $input: UpdateTaskInput!) { updateTask(id: $id, input: $input) { ${FIELDS} } }`;
export const DELETE_TASK = `mutation DeleteTask($id: ID!) { deleteTask(id: $id) { ${FIELDS} } }`;

export const ON_TASK_CREATED = `subscription { onTaskCreated { ${FIELDS} } }`;
export const ON_TASK_UPDATED = `subscription { onTaskUpdated { ${FIELDS} } }`;
export const ON_TASK_DELETED = `subscription { onTaskDeleted { ${FIELDS} } }`;
