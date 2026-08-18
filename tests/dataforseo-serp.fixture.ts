const taskId = "10000000-0000-4000-8000-000000000001";

export const dataForSeoSuccessFixture = {
  version: "3.0.0",
  status_code: 20000,
  tasks: [{
    id: taskId,
    status_code: 20000,
    cost: 0.003,
    result: [{
      keyword: 'allintitle:"marketing para clínicas"',
      location_code: 2076,
      language_code: "pt",
      datetime: "2026-08-04T12:00:00+00:00",
      se_results_count: 60500,
      items_count: 10,
      items: [{ type: "organic", rank_group: 1 }],
      check_url: "https://www.google.com/search?q=allintitle%3A%22marketing%20para%20cl%C3%ADnicas%22",
    }],
  }],
};

export const dataForSeoZeroFixture = {
  ...dataForSeoSuccessFixture,
  tasks: [{
    ...dataForSeoSuccessFixture.tasks[0],
    result: [{ ...dataForSeoSuccessFixture.tasks[0].result[0], se_results_count: 0, items_count: 0, items: [] }],
  }],
};

export const dataForSeoMissingTotalFixture = {
  ...dataForSeoSuccessFixture,
  tasks: [{
    ...dataForSeoSuccessFixture.tasks[0],
    result: [{ ...dataForSeoSuccessFixture.tasks[0].result[0], se_results_count: undefined, items_count: 10, items: new Array(10).fill({ type: "organic" }) }],
  }],
};

export const dataForSeoTaskErrorFixture = {
  ...dataForSeoSuccessFixture,
  tasks: [{ ...dataForSeoSuccessFixture.tasks[0], status_code: 40501, status_message: "Invalid task" }],
};

export const dataForSeoMismatchedLocationFixture = {
  ...dataForSeoSuccessFixture,
  tasks: [{
    ...dataForSeoSuccessFixture.tasks[0],
    result: [{ ...dataForSeoSuccessFixture.tasks[0].result[0], location_code: 1000 }],
  }],
};

export const dataForSeoPartialFixture = {
  ...dataForSeoSuccessFixture,
  tasks: [dataForSeoSuccessFixture.tasks[0], dataForSeoSuccessFixture.tasks[0]],
};

