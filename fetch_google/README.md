# Project Name

## Description
This repository contains a Jupyter Notebook designed for querying Google BigQuery datasets and analyzing sensor data. It provides an interactive environment for executing SQL queries, retrieving sensor statistics, and estimating query costs. 

## Features
- Connects to Google BigQuery using a service account.
- Retrieves key statistics from experiment datasets, including:
  - The number of distinct sensors.
  - The total number of data entries.
  - The latest recorded timestamp.
  - The estimated query cost in USD.
- Displays query results in a Pandas DataFrame for further analysis.
- Allows modification of queries and visualization of data within Jupyter Notebook.

## Installation
1. Clone the repository:
   ```sh
   git clone https://github.com/your-repo.git
   ```
2. Navigate to the project directory:
   ```sh
   cd your-repo
   ```
3. Install dependencies:
   ```sh
   pip install -r requirements.txt
   ```

## Usage
1. Open the Jupyter Notebook:
   ```sh
   jupyter notebook from_google_query_jupyter.ipynb
   ```
2. Alternatively, you can run the notebook in **VS Code** using the Jupyter extension or open it in **Google Colab** by uploading the file.
3. Follow the notebook instructions to execute queries and analyze the data.

## Credentials
If you need a credentials file, please contact the admin:
- **Nir Averbuch**
- **Idan Ifrach**
- **Bnaya Hami**
- **Menachem Moshelion**

## Contributing
1. Fork the repository.
2. Create a new branch:
   ```sh
   git checkout -b feature-branch
   ```
3. Commit your changes:
   ```sh
   git commit -m 'Add new feature'
   ```
4. Push to the branch:
   ```sh
   git push origin feature-branch
   ```
5. Open a pull request.

## License
Specify the license under which the project is distributed (e.g., MIT, GPL, etc.).