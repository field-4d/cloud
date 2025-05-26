import streamlit as st
import logging
from datetime import datetime
import pymongo
from env import MONGO_CLOUD, LOCAL_BUCKET
import pandas as pd
from data import get_dbs_and_collections, fetch_data, reload_dbs_and_collections
import re
import plotly.express as px
import numpy as np

# Setting up logging to log information to a file
logging.basicConfig(
    filename='logs/app_log.log',
    level=logging.INFO,
    format='%(asctime)s,%(levelname)s,%(message)s',
    datefmt='%Y-%m-%d %H:%M:%S', filemode='a'
)

# Establishing a connection to the MongoDB client
myclient_global_read = pymongo.MongoClient(MONGO_CLOUD.url_read)
local_bcucket = LOCAL_BUCKET.local_bucket

# Define the URLs to your images
intersection_img_url = "https://upload.wikimedia.org/wikipedia/commons/thumb/9/99/Venn0001.svg/180px-Venn0001.svg.png"
non_intersecting_img_url = "https://upload.wikimedia.org/wikipedia/commons/thumb/4/46/Venn0110.svg/180px-Venn0110.svg.png"
union_img_url = "https://upload.wikimedia.org/wikipedia/commons/thumb/3/30/Venn0111.svg/180px-Venn0111.svg.png"


def remove_sensor_names(collections):
    """Remove 'sensor_names' from the collections dictionary."""
    cleaned_collections = {}
    for db, exps in collections.items():
        cleaned_collections[db] = {}
        for exp, details in exps.items():
            cleaned_details = {k: v for k, v in details.items() if k != 'sensor_names'}
            cleaned_collections[db][exp] = cleaned_details
    return cleaned_collections

def get_device_location(dbs_list):
    """Get the device location for each database (MAC_Address)."""
    devices = myclient_global_read['Devices_And_Users']['Devices'].find({"MAC_Address": {"$in": dbs_list}})
    device_location = {device["MAC_Address"]: device["device_location"] for device in devices}
    for db in dbs_list:
        if db not in device_location:
            device_location[db] = db
    return device_location

def get_sorted_experiments(options):
    """Sort the experiments dictionary based on its values."""
    sorted_items = sorted(options.items(), key=lambda item: str(item[1]))
    return {k: v for k, v in sorted_items}

def apply_iqr_filter(df, column, n=1.5):
    """Apply IQR filter to the dataframe."""
    Q1 = df[column].quantile(0.25)
    Q3 = df[column].quantile(0.75)
    IQR = Q3 - Q1
    filter = (df[column] >= Q1 - n * IQR) & (df[column] <= Q3 + n * IQR)
    df.loc[~filter, column] = np.nan
    return df

def apply_std_filter(df, column, n=2.5):
    """Apply Standard Deviation filter to the dataframe."""
    mean = df[column].mean()
    std_dev = df[column].std()
    filter = (df[column] >= mean - n * std_dev) & (df[column] <= mean + n * std_dev)
    df.loc[~filter, column] = np.nan
    return df

def apply_zscore_filter(df, column, threshold=3):
    """Apply Z-Score filter to the dataframe."""
    mean = df[column].mean()
    std_dev = df[column].std()
    df['zscore'] = (df[column] - mean) / std_dev
    filter = np.abs(df['zscore']) < threshold
    df.loc[~filter, column] = np.nan
    return df

def dash_board():
    """Main function to display the dashboard."""
    all_dbs_list, all_collection_dict = get_dbs_and_collections(local_bcucket)
    dbs_list, collection_dict = get_dbs_and_collections(local_bcucket)

    st.empty()
    st.title('Sensor Data Visualization')

    with st.sidebar:
        if st.button('Reload Databases and Collections', help='Press if the last date is not updated', key='reload_button'):
            reload_dbs_and_collections()
            st.experimental_rerun()  # Refresh the app to update the lists

        device_location = get_device_location(dbs_list)
        first_location = list(device_location.values())[0] if device_location else device_location.keys()[0]
        if first_location:
            location_to_mac = {location: mac for mac, location in device_location.items()}
        else:
            location_to_mac = {db: db for db in dbs_list}

        selected_db = local_bcucket
        sorted_experiments = list(get_sorted_experiments(collection_dict[local_bcucket]))
        sorted_experiments = [re.sub(r'_DATA', '', exp) for exp in sorted_experiments]
        selected_col = st.selectbox("Select experiment", sorted_experiments, help='Select your preferred experiment', key='select_experiment')
        Date_Format = "%Y-%m-%d"
        
        if selected_col:
            with st.expander("Graph Viwer", expanded=True):
                selected_col = selected_col + "_DATA"
                
                try:
                    sensor_label_options = all_collection_dict[selected_db][selected_col]["label_options"]
                    # Add multiselect for sensor_label_options
                    selected_label_options = st.multiselect(
                        "Select Label Options",
                        sensor_label_options,
                        default=sensor_label_options,
                        help='Select your preferred label options (Venn diagram):  https://en.wikipedia.org/wiki/Venn_diagram. ',
                        key='multiselect_label_options'
                    )

                    # Add radio button for Intersection, Non-intersecting Areas, and Union
                    label_filter_type = st.radio(
                        "Select label filter type",
                        options=["Intersection", "Non-intersecting Areas", "Union"],
                        help='Choose how to filter sensors based on labels',
                        key='radio_label_filter_type'
                    )

                except KeyError:
                    selected_label_options = []
                    st.warning("No label options available for the selected experiment.")

                sensor_names = all_collection_dict[selected_db][selected_col]["sensor_names"]
                sensor_label_dict = all_collection_dict[selected_db][selected_col].get("Sensor_Label", {})

                select_all_sensors = st.checkbox("Select All Sensors", value=False, help='Press to select all sensors', key='select_all_sensors')
                
                if 'selected_sensors' not in st.session_state:
                    st.session_state.selected_sensors = sensor_names if select_all_sensors else []
                
                # Automatically update sensor selection based on label options and filter type
                if selected_label_options:
                    if label_filter_type == "Intersection":
                        st.session_state.selected_sensors = [
                            sensor for sensor in sensor_names
                            if all(label in sensor_label_dict.get(sensor, []) for label in selected_label_options)
                        ]
                    elif label_filter_type == "Non-intersecting Areas":
                        st.session_state.selected_sensors = [
                            sensor for sensor in sensor_names
                            if any(label in selected_label_options for label in sensor_label_dict.get(sensor, []))
                        ]
                    elif label_filter_type == "Union":
                        st.session_state.selected_sensors = [
                            sensor for sensor in sensor_names
                            if any(label in sensor_label_dict.get(sensor, []) for label in selected_label_options)
                        ]
                
                # Ensure default values are valid options
                valid_selected_sensors = [sensor for sensor in st.session_state.selected_sensors if sensor in sensor_names]
                selected_sensors = st.multiselect("Select sensors", sensor_names, default=valid_selected_sensors, key='multiselect_sensors')
                
                date_range_info = all_collection_dict[selected_db][selected_col]
                min_date = datetime.strptime(date_range_info["first_date"], Date_Format) if date_range_info["first_date"] else datetime.now()
                max_date = datetime.strptime(date_range_info["last_date"], Date_Format) if date_range_info["last_date"] else datetime.now()
                Today_Date = datetime.now().strftime(Date_Format)

                date_range = st.date_input("Select date range", value=(min_date, max_date), min_value=min_date, max_value=max_date, help='Select dates, if last date is not updated press "Reload Databases and Collection"', key='date_range')
                
                if isinstance(date_range, tuple) and len(date_range) == 2:
                    start_date, end_date = date_range
                else:
                    start_date, end_date = None, None
                # add check box to pull the advanced options
            
                if st.button('Load Data', help='Load the data', key='load_data_button'):
                    df = fetch_data(start_date, end_date, selected_db, selected_col, selected_sensors)
                    if not df.empty:
                        st.session_state['original_data'] = df
                        st.session_state['data'] = df
                        st.success('Data loaded successfully!')
                    else:
                        st.error("No data available for the selected date range.")
                if 'original_data' in st.session_state:
                    # Create a DataFrame of the original data
                    df_full_data = st.session_state['original_data']
                    df_full_data_modify = df_full_data.copy()       
                    # Remove the TimeStamp.$date column 
                    df_full_data_modify.drop(columns=['TimeStamp.$date'], inplace=True)     
                    # Set TimeStamp as datetime and as index
                    df_full_data_modify['TimeStamp'] = pd.to_datetime(df_full_data_modify['TimeStamp'])      
                    # Convert TimeStamp like this: round('3min').strftime('%Y-%m-%dT%H:%M:%S')
                    df_full_data_modify['TimeStamp'] = df_full_data_modify['TimeStamp'].round('3min').dt.strftime('%Y-%m-%dT%H:%M:%S')    
                    # Set TimeStamp as index
                    df_full_data_modify.set_index('TimeStamp', inplace=True)


                    csv_full_data = df_full_data_modify.to_csv(index=True).encode('utf-8')
                    st.download_button("Press to Download Full Raw Data", csv_full_data, f"Full_Data_{selected_col}.csv", "text/csv", key='the data is not cleaned using any outlier detection method')

    if 'original_data' in st.session_state and not st.session_state['original_data'].empty:
        st.write("Data loaded successfully!")
        # parameter = st.selectbox('Select Parameter', ['temperature', 'humidity', 'light', 'barometric_pressure', 'barometric_temp', 'battery'], key='select_parameter')
        # parameter_units = {'temperature': '°C','humidity': '%','light': 'lux','barometric_pressure': 'millibars ','barometric_temp': '°C','battery': 'Voltage'}
        parameter = st.selectbox('Select Parameter',list(df_full_data_modify.columns), key='select_parameter')
        parameter_units = {
            'temperature': '°C',
            'humidity': '%',
            'light': 'lux',
            'barometric_pressure': 'millibars',
            'barometric_temp': '°C',
            'battery': 'Voltage',
            'tmp107_amb': '°C',
            'tmp107_obj': '°C',
            'bmp_390_u18_pressure': 'millibars',
            'bmp_390_u18_temperature': '°C',
            'bmp_390_u19_pressure': 'millibars',
            'bmp_390_u19_temperature': '°C',
            'hdc_2010_u13_temperature': '°C',
            'hdc_2010_u13_humidity': '%',
            'hdc_2010_u16_temperature': '°C',
            'hdc_2010_u16_humidity': '%',
            'hdc_2010_u17_temperature': '°C',
            'hdc_2010_u17_humidity': '%',
            'opt_3001_u1_light_intensity': 'lux',
            'opt_3001_u2_light_intensity': 'lux',
            'opt_3001_u3_light_intensity': 'lux',
            'opt_3001_u4_light_intensity': 'lux',
            'opt_3001_u5_light_intensity': 'lux',
            'batmon_temperature': '°C',
            'batmon_battery_voltage': 'Voltage',
            'co2_ppm': 'ppm',
            'air_velocity': 'm/s'
        }

                      
        filter_method = st.radio("Select Outlier Detection Method", ('None', 'IQR-Outlier filter', 'Standard Deviation filter', 'Z-Score filter'), key='filter_method')
        
        if filter_method == 'IQR-Outlier filter':
            st.markdown("[Interquartile Range (IQR) Outlier Filter](https://en.wikipedia.org/wiki/Interquartile_range): This method identifies outliers by looking at the spread of the middle 50% of the data.")
            n_iqr_slider = st.slider('Select IQR multiplier', min_value=0.5, max_value=3.0, value=2.5, step=0.1, key='IQR_multiplier_slider')
        elif filter_method == 'Standard Deviation filter':
            st.markdown("[Standard Deviation Outlier Filter](https://en.wikipedia.org/wiki/Standard_deviation): This method identifies outliers by looking at how many standard deviations a data point is from the mean.")
            n_std_slider = st.slider('Select Standard Deviation multiplier', min_value=1.0, max_value=5.0, value=2.5, step=0.5, key='STD_multiplier_slider')
        elif filter_method == 'Z-Score filter':
            st.markdown("[Z-Score Outlier Filter](https://en.wikipedia.org/wiki/Standard_score): This method identifies outliers by looking at the Z-score, which measures how many standard deviations a data point is from the mean.")
            n_z_slider = st.slider('Select Z-Score multiplier', min_value=1.0, max_value=5.0, value=3.0, step=0.5, key='Z_Score_multiplier_slider')
        
        if st.button('Show Graphs for Selected Parameter', key='show_graphs_button'):
            try:
                df = st.session_state['original_data'].copy()

                if filter_method == 'IQR-Outlier filter':
                    df = apply_iqr_filter(df, parameter, n_iqr_slider)
                elif filter_method == 'Standard Deviation filter':
                    df = apply_std_filter(df, parameter, n_std_slider)
                elif filter_method == 'Z-Score filter':
                    df = apply_zscore_filter(df, parameter)

                sorted_names = sorted(df['Name'].unique())
                # if selected paramter larget than 100,000 replace replace with NaN
                df[parameter] = df[parameter].apply(lambda x: np.nan if x > 100000 else x)
                # For Nan values use moving average to fill the missing values
                df[parameter] = df[parameter].fillna(df[parameter].rolling(3, min_periods=1).mean())
                
                
                
                fig = px.line(df, x='TimeStamp', y=parameter, color='Name', title=f'{parameter} Over Time by Sensor', category_orders={'Name': sorted_names})
                fig.update_xaxes(title_text='Time')
                fig.update_yaxes(title_text=f"{parameter} ({parameter_units[parameter]})")
                fig.update_layout(legend_title_text='Sensor Name', width=1000, height=600)
                st.session_state['fig'] = fig

                # Prepare data for CSV download
                df_pivot = df.pivot_table(index='TimeStamp', columns='Name', values=parameter, aggfunc='mean')
                df_pivot.index = df_pivot.index.strftime('%Y-%m-%dT%H:%M')
                if parameter in ['co2_ppm', 'air_velocity']:
                    df_pivot.index = pd.to_datetime(df_pivot.index).round('9min').strftime('%Y-%m-%dT%H:%M:%S')
                else:
                    df_pivot.index = pd.to_datetime(df_pivot.index).round('3min').strftime('%Y-%m-%dT%H:%M:%S')

                df_pivot.index.name = "TimeStamp"
                st.session_state['df_pivot'] = df_pivot
            except KeyError:
                st.error("No data available for the selected parameter.")
                logging.error("No data available for the selected parameter.")

    if 'fig' in st.session_state:
        st.plotly_chart(st.session_state['fig'])

    if 'df_pivot' in st.session_state:
        # set variable for the original_data
        df_pivot = st.session_state['df_pivot']


        csv = df_pivot.to_csv(index=True).encode('utf-8')
        st.download_button(f"Press to Download {parameter}", csv, f"{selected_col}_{parameter}.csv", "text/csv", key='download_csv_button')



