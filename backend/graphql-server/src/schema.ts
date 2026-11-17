export const typeDefs = /* GraphQL */ `
  enum TaskStatus {
    TODO
    IN_PROGRESS
    DONE
  }

  type Task {
    id: ID!
    title: String!
    description: String
    status: TaskStatus!
    createdAt: String!
    updatedAt: String!
  }

  input CreateTaskInput {
    title: String!
    description: String
    status: TaskStatus
  }

  input UpdateTaskInput {
    title: String
    description: String
    status: TaskStatus
  }

  type Query {
    tasks(status: TaskStatus, limit: Int): [Task!]!
    task(id: ID!): Task
  }

  type Mutation {
    createTask(input: CreateTaskInput!): Task!
    updateTask(id: ID!, input: UpdateTaskInput!): Task!
    deleteTask(id: ID!): Task
  }
`;
