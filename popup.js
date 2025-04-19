document.addEventListener('DOMContentLoaded', () => {
  const toggleBtn = document.getElementById("toggleAddCompany");
  const companyForm = document.getElementById("companyInputs");
  const saveBtn = document.getElementById("saveCompany");
  const output = document.getElementById("jobList");
  const checkBtn = document.getElementById("checkBtn");
  const buttonContainer = document.getElementById("buttonContainer");
  const resultDiv = document.getElementById("result");
  const card = document.querySelector(".card");

  let filterKeywords = [];

  // Load filter from Chrome storage
  chrome.storage.sync.get(['filterKeywords'], (result) => {
    if (result.filterKeywords) {
      filterKeywords = result.filterKeywords;
      document.getElementById("filterKeywords").value = filterKeywords.join(', ');
    }
  });

  // Save filter keywords to storage
  document.getElementById("saveFilter").addEventListener("click", () => {
    const keywords = document.getElementById("filterKeywords").value
      .split(',')
      .map(k => k.trim().toLowerCase())
      .filter(k => k.length > 0);
    chrome.storage.sync.set({ filterKeywords: keywords }, () => {
      filterKeywords = keywords;
      alert("Filter saved!");
    });
  });

  // Toggle visibility of filter input
  document.getElementById("filterBtn").addEventListener("click", () => {
    const container = document.getElementById("filterInputContainer");
    container.style.display = container.style.display === 'none' ? 'block' : 'none';
  });

  // Filtering function
  function jobTitleIsAllowed(title) {
    return !filterKeywords.some(keyword => title.toLowerCase().includes(keyword));
  }

  if (buttonContainer && toggleBtn && checkBtn) {
    buttonContainer.appendChild(toggleBtn);
  }

  toggleBtn.addEventListener("click", () => {
    companyForm.classList.toggle("active");
  });

  saveBtn.addEventListener("click", () => {
    const name = document.getElementById("companyName").value.trim();
    const url = document.getElementById("companyUrl").value.trim();
    const className = document.getElementById("className").value.trim();

    if (!name || !url || !className) {
      alert("Please fill in all fields.");
      return;
    }

    chrome.storage.local.get({ companies: [] }, (result) => {
      const updated = [...result.companies, { name, url, className }];
      chrome.storage.local.set({ companies: updated }, () => {
        alert(`${name} saved!`);
        document.getElementById("companyName").value = "";
        document.getElementById("companyUrl").value = "";
        document.getElementById("className").value = "";
        companyForm.classList.remove("active");
      });
    });
  });

  function renderJobs(jobData, appliedJobs) {
    output.innerHTML = "";
    jobData.forEach(({ company, jobs }) => {
      const companyTitle = document.createElement("h2");
      companyTitle.textContent = company;
  
      const removeBtn = document.createElement("button");
      removeBtn.textContent = "-";
      removeBtn.classList.add("remove-company");
  
      removeBtn.addEventListener("click", () => {
        chrome.storage.local.get({ companies: [], jobData: [] }, (result) => {
          const updatedCompanies = result.companies.filter(c => c.name !== company);
          const updatedJobData = result.jobData.filter(data => data.company !== company);
  
          chrome.storage.local.set({ companies: updatedCompanies, jobData: updatedJobData }, () => {
            alert(`${company} removed!`);
            renderJobs(updatedJobData, appliedJobs);
          });
        });
      });
  
      const companyContainer = document.createElement("div");
      companyContainer.classList.add("company-container");
      companyContainer.appendChild(companyTitle);
      companyContainer.appendChild(removeBtn);
      output.appendChild(companyContainer);
  
      const ul = document.createElement("ul");
      jobs.forEach(job => {
        if (jobTitleIsAllowed(job)) {
          const li = document.createElement("li");
  
          const checkbox = document.createElement("input");
          checkbox.type = "checkbox";
          checkbox.checked = appliedJobs.includes(job);
  
          checkbox.addEventListener("change", () => {
            chrome.storage.local.get({ appliedJobs: [] }, (res) => {
              let updated = [...res.appliedJobs];
              if (checkbox.checked) {
                if (!updated.includes(job)) updated.push(job);
              } else {
                updated = updated.filter(j => j !== job);
              }
              chrome.storage.local.set({ appliedJobs: updated });
            });
          });
  
          const label = document.createElement("label");
          label.textContent = job;
  
          // Create a container for the job title to enable horizontal scroll
          const jobTitleContainer = document.createElement("div");
          jobTitleContainer.classList.add("job-title-container");
          jobTitleContainer.appendChild(label);
  
          li.appendChild(checkbox);
          li.appendChild(jobTitleContainer);
          ul.appendChild(li);
        }
      });
      output.appendChild(ul);
    });
  }  

  chrome.storage.local.get({ jobData: [], appliedJobs: [] }, ({ jobData, appliedJobs }) => {
    if (Array.isArray(jobData)) {
      renderJobs(jobData, appliedJobs);
    }
  });

  function showToast(msg, isSuccess) {
    const toast = document.createElement("div");
    toast.textContent = msg;
    toast.style.position = "fixed";
    toast.style.bottom = "80px";
    toast.style.right = "20px";
    toast.style.padding = "10px 20px";
    toast.style.backgroundColor = isSuccess ? "#34a853" : "#ea4335";
    toast.style.color = "white";
    toast.style.borderRadius = "8px";
    toast.style.boxShadow = "0 2px 6px rgba(0,0,0,0.3)";
    toast.style.zIndex = "9999";
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 2500);
  }

  async function waitForElement(tabId, className) {
    const maxRetries = 10;
    let attempt = 0;

    return new Promise((resolve, reject) => {
      const interval = setInterval(async () => {
        console.log(`Attempt ${attempt + 1} to find ${className} on the page...`);

        const [{ result }] = await chrome.scripting.executeScript({
          target: { tabId },
          func: (className) => {
            return document.querySelector(`.${className}`) !== null;
          },
          args: [className],
        });

        if (result) {
          console.log(`Element ${className} found on attempt ${attempt + 1}`);
          clearInterval(interval);
          resolve();
        }

        attempt++;
        if (attempt >= maxRetries) {
          console.error(`Timeout: Couldn't find element ${className} after ${maxRetries} attempts`);
          clearInterval(interval);
          reject(`Timeout: Couldn't find element after ${maxRetries} attempts`);
        }
      }, 1000);
    });
  }

  async function scrapeFromTab(tabId, className) {
    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId },
      func: async (className) => {
        function waitForElements(selector, timeout = 10000) {
          return new Promise((resolve, reject) => {
            const start = Date.now();
            const check = () => {
              const elements = document.querySelectorAll(selector); // Use full selector
              if (elements.length > 0) {
                resolve(Array.from(elements).map(el => el.textContent.trim()).filter(Boolean));
              } else if (Date.now() - start > timeout) {
                reject(new Error("Timeout waiting for elements"));
              } else {
                setTimeout(check, 300);
              }
            };
            check();
          });
        }
        
        try {
          // Split the className into individual classes and join them with dots for a valid selector
          const selector = className.split(' ').map(cls => `.${cls}`).join('');
          return await waitForElements(selector);
        } catch {
          return [];
        }
      },
      args: [className],
    });
    return result;
  }  

  async function scrollPageToBottom(tabId) {
    console.log('Scrolling the page to load content...');
    await chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        window.scrollTo(0, document.body.scrollHeight);
      },
    });
    await new Promise(resolve => setTimeout(resolve, 2000));
  }

  checkBtn.addEventListener("click", async () => {
    const loader = document.createElement("div");
    loader.className = "loader-container";
    loader.innerHTML = `<div class="loader"></div>`;
    output.innerHTML = "";
    output.appendChild(loader);
  
    chrome.storage.local.get({ companies: [], appliedJobs: [], jobData: [] }, async ({ companies, appliedJobs, jobData }) => {
      const newJobData = [];
      let foundNew = false;
  
      const scrapeJobsForCompany = async ({ name, url, className }) => {
        let tabId;
        let openedNewTab = false;
  
        try {
          const [existingTab] = await chrome.tabs.query({ url });
  
          if (existingTab) {
            tabId = existingTab.id;
          } else {
            const newTab = await chrome.tabs.create({ url, active: false });
            tabId = newTab.id;
            openedNewTab = true;
  
            // Wait until tab finishes loading
            await new Promise(resolve => {
              const checkTabLoaded = () => {
                chrome.tabs.get(tabId, (tab) => {
                  if (tab && tab.status === "complete") {
                    resolve();
                  } else {
                    setTimeout(checkTabLoaded, 2000);
                  }
                });
              };
              checkTabLoaded();
            });
          }
  
          const jobs = await scrapeFromTab(tabId, className);
          const prevCompanyData = jobData.find(entry => entry.company === name);
          const prevJobs = prevCompanyData ? prevCompanyData.jobs : [];
          const newJobs = jobs.filter(job => !prevJobs.includes(job));
  
          if (newJobs.length > 0) foundNew = true;
          newJobData.push({ company: name, jobs });
  
          if (openedNewTab) await chrome.tabs.remove(tabId);
        } catch (err) {
          console.error(`Failed scraping ${name}:`, err);
          newJobData.push({ company: name, jobs: [] });
        }
      };
  
      await Promise.all(companies.map(scrapeJobsForCompany));
  
      output.innerHTML = "";
      chrome.storage.local.set({ jobData: newJobData }, () => {
        renderJobs(newJobData, appliedJobs);
      });
  
      resultDiv.textContent = "";
      card.classList.add("flash-success");
      setTimeout(() => card.classList.remove("flash-success"), 1000);
      showToast(foundNew ? "🎉 New jobs found!" : "📭 No new jobs.", foundNew);
    });
  });  
});
