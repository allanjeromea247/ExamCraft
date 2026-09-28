const API = (() => {
    async function request(path, options = {}) {
        const response = await fetch(path, {
            ...options,
            headers: {
                Accept: "application/json",
                ...(options.body ? { "Content-Type": "application/json" } : {}),
                ...options.headers
            }
        });

        if (response.status === 204) {
            return null;
        }

        const contentType = response.headers.get("content-type") || "";
        const result = contentType.includes("application/json")
            ? await response.json()
            : await response.text();

        if (!response.ok) {
            const backendMessage = typeof result === "string"
                ? result
                : result.error || result.message || `Request failed (${response.status})`;
            const implementationError = /^(Cannot invoke|java\.|org\.|.*Exception\b|SQL\b)|(?:JDBC|Hibernate|SQLState|Communications link failure|Connection refused)/i.test(backendMessage);
            const message = implementationError || !contentType.includes("application/json")
                ? "The request could not be completed. Check the question data and try again."
                : backendMessage;
            throw new Error(message);
        }

        return result;
    }

    const json = (method, body) => ({
        method,
        body: JSON.stringify(body)
    });

    return {
        questions: {
            list: () => request("/questions"),
            get: (id) => request(`/questions/${id}`),
            create: (question) => request("/questions", json("POST", question)),
            update: (id, question) => request(`/questions/${id}`, json("PUT", question)),
            remove: (id) => request(`/questions/${id}`, { method: "DELETE" }),
            usage: () => request("/questions/usage")
        },
        units: {
            list: () => request("/units")
        },
        tests: {
            generate: ({ totalQuestions, easyPercent, mediumPercent, hardPercent }) => {
                const query = new URLSearchParams({
                    totalQuestions,
                    easyPercent,
                    mediumPercent,
                    hardPercent
                });
                return request(`/tests/generate?${query}`);
            }
        },
        attempts: {
            create: (questionIds) => request("/attempts", json("POST", questionIds)),
            get: (id) => request(`/attempts/${id}`),
            submit: (id, answers) => request(`/attempts/${id}/submit`, json("POST", { answers }))
        }
    };
})();